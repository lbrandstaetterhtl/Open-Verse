import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { updateProfileSchema, updatePasswordSchema } from '@shared/schema';
import { sendVerificationEmail } from "./utils/email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

async function createVerificationToken(userId: number): Promise<string> {
  const token = generateVerificationToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

  await storage.createVerificationToken({
    token,
    userId,
    expiresAt,
  });

  return token;
}

export function setupAuth(app: Express, sessionParser: session.RequestHandler) {
  app.set("trust proxy", 1);
  app.use(sessionParser);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log("Login failed: User not found:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log("Login failed: Invalid password for user:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log("Login successful for user:", username);
        return done(null, user);
      } catch (err) {
        console.error("Login error:", err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log("Serializing user:", user.id, "with avatar:", user.avatarUrl);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        console.log("Session invalid: User not found:", id);
        return done(null, false);
      }
      console.log("Deserialized user:", user.id, "with avatar:", user.avatarUrl);
      done(null, user);
    } catch (err) {
      console.error("Session error:", err);
      done(err);
    }
  });

  app.post("/api/register", async (req, res) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        return res.status(400).send("Email already registered");
      }

      // Create the user first
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        emailVerified: false,
      });

      // Only attempt email verification if SendGrid is properly configured
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.')) {
        try {
          const verificationToken = await createVerificationToken(user.id);
          await sendVerificationEmail(user.email, user.username, verificationToken);
        } catch (emailErr) {
          console.error('Error sending verification email:', emailErr);
          // Continue with registration even if email fails
        }
      } else {
        console.log('SendGrid API key not properly configured - skipping verification email');
      }

      // Log the user in with the complete user object including avatarUrl
      req.login(user, (err) => {
        if (err) return res.status(500).send(err.message);
        res.status(201).json(user);
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).send("Registration failed");
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).send(info?.message || "Invalid credentials");

      req.login(user, (err) => {
        if (err) return next(err);
        console.log("User logged in successfully:", user.username, "with avatar:", user.avatarUrl);
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const username = req.user?.username;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        console.log("User logged out successfully:", username);
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("Unauthenticated access attempt to /api/user");
      return res.sendStatus(401);
    }
    console.log("User data requested for:", req.user?.username, "with avatar:", req.user?.avatarUrl);
    res.json(req.user);
  });

  app.patch("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    if (result.data.username) {
      const existingUser = await storage.getUserByUsername(result.data.username);
      if (existingUser && existingUser.id !== req.user!.id) {
        return res.status(400).send("Username already taken");
      }
    }

    if (result.data.email) {
      const existingEmail = await storage.getUserByEmail(result.data.email);
      if (existingEmail && existingEmail.id !== req.user!.id) {
        return res.status(400).send("Email already registered");
      }
    }

    const updatedUser = await storage.updateUserProfile(req.user!.id, result.data);

    // Force session update with new user data
    req.login(updatedUser, (err) => {
      if (err) return res.status(500).send(err.message);
      res.json(updatedUser);
    });
  });

  app.patch("/api/profile/password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const result = updatePasswordSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const user = await storage.getUser(req.user!.id);
    if (!user || !(await comparePasswords(result.data.currentPassword, user.password))) {
      return res.status(400).send("Current password is incorrect");
    }

    const updatedUser = await storage.updateUserPassword(
      req.user!.id,
      await hashPassword(result.data.newPassword)
    );
    res.json(updatedUser);
  });
}