import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { updateProfileSchema, updatePasswordSchema } from '@shared/schema';
import { verificationTokens } from "@shared/schema";
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

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
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

      // Try to send verification email, but don't block registration if it fails
      try {
        const verificationToken = await createVerificationToken(user.id);
        await sendVerificationEmail(user.email, user.username, verificationToken);
      } catch (emailErr) {
        console.error('Error sending verification email:', emailErr);
        // Continue with registration even if email fails
      }

      // Log the user in
      req.login(user, (err) => {
        if (err) return res.status(500).send(err.message);
        res.status(201).json(user);
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).send("Registration failed");
    }
  });

  app.get("/api/verify-email", async (req, res) => {
    try {
      const { token } = req.query;
      if (!token || typeof token !== 'string') {
        return res.status(400).send("Invalid verification token");
      }

      const verificationToken = await storage.getVerificationToken(token);
      if (!verificationToken) {
        return res.status(400).send("Invalid or expired verification token");
      }

      if (new Date() > verificationToken.expiresAt) {
        await storage.deleteVerificationToken(token);
        return res.status(400).send("Verification token has expired");
      }

      await storage.verifyUserEmail(verificationToken.userId);
      await storage.deleteVerificationToken(token);

      res.redirect("/auth?verified=true");
    } catch (err) {
      console.error('Verification error:', err);
      res.status(500).send("Email verification failed");
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) return res.status(401).send(info.message || "Invalid credentials");

      req.login(user, (err) => {
        if (err) return next(err);
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Add profile update endpoints
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
    res.json(updatedUser);
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