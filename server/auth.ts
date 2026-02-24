import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcrypt";
import { storage, sanitizeUser } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { updateProfileSchema, updatePasswordSchema } from "@shared/schema";
import { sendVerificationEmail } from "./utils/email";
import rateLimit from "express-rate-limit";
import { logSecurityEvent } from "./utils/logger";
import { insertUserSchema } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  return await bcrypt.hash(password, 12);
}

async function comparePasswords(supplied: string, stored: string) {
  // Check if it's already a bcrypt hash
  if (stored.startsWith("$2b$") || stored.startsWith("$2a$") || stored.startsWith("$2y$")) {
    try {
      const isValid = await bcrypt.compare(supplied, stored);
      return { isValid, needsMigration: false };
    } catch {
      return { isValid: false, needsMigration: false };
    }
  }

  // Fallback to legacy scrypt verification
  try {
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) return { isValid: false, needsMigration: false };

    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    const isValid = timingSafeEqual(hashedBuf, suppliedBuf);
    return { isValid, needsMigration: isValid };
  } catch (err) {
    return { isValid: false, needsMigration: false };
  }
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

export const validateCsrf = (req: any, res: any, next: any) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const token = req.headers["x-csrf-token"];
  const sessionToken = (req.session as any)?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    logSecurityEvent({
      type: "CSRF_FAILURE",
      ip: req.ip || req.socket.remoteAddress,
      resource: req.path,
      details: { method: req.method },
    });
    return res.status(403).send("Invalid CSRF Token");
  }
  next();
};

export function setupAuth(app: Express, sessionParser: any) {
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use(sessionParser);
  app.use(passport.initialize());
  app.use(passport.session());

  // CSRF Token Initialization
  app.use((req, res, next) => {
    if (req.session && !(req.session as any).csrfToken) {
      (req.session as any).csrfToken = randomBytes(32).toString("hex");
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 login attempts per window
    message: "Too many login attempts, please try again later",
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log("Login failed: User not found:", username);
          logSecurityEvent({
            type: "AUTH_FAILURE",
            details: { reason: "User not found", username },
          });
          return done(null, false, { message: "Invalid username or password" });
        }

        const { isValid, needsMigration } = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log("Login failed: Invalid password for user:", username);
          logSecurityEvent({
            type: "AUTH_FAILURE",
            userId: user.id,
            details: { reason: "Invalid password" },
          });
          return done(null, false, { message: "Invalid username or password" });
        }

        // Transparently upgrade legacy scrypt hash to bcrypt
        if (needsMigration) {
          try {
            const newHash = await hashPassword(password);
            await storage.updateUserPassword(user.id, newHash);
            console.log(`[AUTH] Migrated legacy password hash to bcrypt for user: ${username}`);
          } catch (migrateErr) {
            console.error(`[AUTH] Failed to migrate password for user ${username}:`, migrateErr);
          }
        }

        // Check if user is banned (negative karma)
        if (user.karma < 0) {
          console.log("Login blocked: User is banned:", username);
          logSecurityEvent({ type: "AUTH_BANNED_ATTEMPT", userId: user.id, details: { username } });
          return done(null, false, {
            message: "Your account has been banned. Please contact support.",
          });
        }

        console.log("Login successful for user:", username);
        logSecurityEvent({ type: "AUTH_SUCCESS", userId: user.id });
        return done(null, user);
      } catch (err) {
        console.error("Login error:", err);
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        console.log("Session invalid: User not found:", id);
        return done(null, false);
      }

      // SEC-003 FIX: Check ban status
      if (user.karma < 0) {
        console.log("Session invalid: User is banned:", id);
        return done(null, false); // Invalidate session
      }

      done(null, sanitizeUser(user));
    } catch (err) {
      console.error("Session error:", err);
      done(err);
    }
  });

  app.post("/api/register", authLimiter, async (req, res) => {
    try {
      // SEC-FIX: Validate input against schema (enforces password complexity)
      const data = insertUserSchema.parse(req.body);

      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).send("Email already registered");
      }

      // Create the user first
      const user = await storage.createUser({
        ...data,
        password: await hashPassword(data.password),
      } as any);

      // Verify email if needed or just set as verified for now
      await storage.verifyUserEmail(user.id);

      // Add Default Theme for new user
      try {
        const defaultThemeColors = {
          light: {
            background: "0 0% 100%",
            foreground: "222 47% 11%",
            card: "0 0% 100%",
            cardForeground: "222 47% 11%",
            popover: "0 0% 100%",
            popoverForeground: "222 47% 11%",
            primary: "215 70% 50%",
            primaryForeground: "0 0% 98%",
            secondary: "210 40% 96%",
            secondaryForeground: "222 47% 11%",
            muted: "210 40% 96%",
            mutedForeground: "215 16% 47%",
            accent: "210 40% 96%",
            accentForeground: "222 47% 11%",
            destructive: "0 84% 60%",
            destructiveForeground: "0 0% 98%",
            border: "214 32% 91%",
            input: "214 32% 91%",
            ring: "215 70% 50%",
          },
          dark: {
            background: "222 47% 11%",
            foreground: "210 40% 98%",
            card: "222 47% 11%",
            cardForeground: "210 40% 98%",
            popover: "222 47% 11%",
            popoverForeground: "210 40% 98%",
            primary: "217 91% 60%",
            primaryForeground: "222 47% 11%",
            secondary: "217 33% 17%",
            secondaryForeground: "210 40% 98%",
            muted: "217 33% 17%",
            mutedForeground: "215 20% 65%",
            accent: "217 33% 17%",
            accentForeground: "210 40% 98%",
            destructive: "0 62% 30%",
            destructiveForeground: "210 40% 98%",
            border: "217 33% 17%",
            input: "217 33% 17%",
            ring: "217 91% 60%",
          },
        };
        await storage.createTheme(user.id, {
          name: "Default Blue",
          colors: JSON.stringify(defaultThemeColors),
        });
      } catch (themeError) {
        console.error("Failed to create default theme for new user:", themeError);
        // Don't block registration
      }

      // Only attempt email verification if SendGrid is properly configured
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith("SG.")) {
        try {
          const verificationToken = await createVerificationToken(user.id);
          await sendVerificationEmail(user.email, user.username, verificationToken);
        } catch (emailErr) {
          console.error("Error sending verification email:", emailErr);
          // Continue with registration even if email fails
        }
      } else {
        console.log("SendGrid API key not properly configured - skipping verification email");
      }

      // Log the user in
      req.login(user, (err) => {
        if (err) return res.status(500).send(err.message);
        logSecurityEvent({
          type: "AUTH_SUCCESS",
          userId: user.id,
          details: { action: "register" },
        });
        res.status(201).json(user);
      });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).send("Registration failed");
    }
  });

  app.post("/api/login", authLimiter, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).send(info?.message || "Invalid credentials");

      req.login(user, (err) => {
        if (err) return next(err);
        console.log("User logged in successfully:", user.username);
        res.json(sanitizeUser(user));
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
    console.log("User data requested for:", req.user?.username);
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
    if (!user) {
      return res.status(401).send("Unauthorized");
    }

    const { isValid } = await comparePasswords(result.data.currentPassword, user.password);
    if (!isValid) {
      return res.status(400).send("Current password is incorrect");
    }

    const updatedUser = await storage.updateUserPassword(
      req.user!.id,
      await hashPassword(result.data.newPassword),
    );
    res.json(updatedUser);
  });
}
