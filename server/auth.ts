import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import type { User as SelectUser } from "@shared/schema";
import { bans, users, updateProfileSchema, updatePasswordSchema, insertUserSchema } from "@shared/schema";
import { sendVerificationEmail } from "./utils/email";
import rateLimit from "express-rate-limit";
import { activityLogger } from "./services/activity-logger";
import { SettingsService } from "./services/settings";
import { closeSessionSockets, closeUserSockets } from "./services/websocket";
import { logger } from "./logger";
import { hashPassword, verifyPassword, burnPasswordCheck, passwordStamp } from "./utils/password-hash";
import { toSelfUser } from "./utils/public-user";
import { BANNED_KARMA, previousKarmaOf } from "./services/bulk-action-service";

import { sendValidationError, sendInternalError } from "./utils/http-errors";
declare global {
  namespace Express {
    interface User extends SelectUser {
      adminGroup?: import("@shared/schema").AdminGroup;
    }
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
    logger.securityEvent({
      type: "CSRF_FAILURE",
      ip: req.ip || req.socket.remoteAddress,
      severity: 'medium',
      details: { method: req.method, path: req.path },
    });
    // The client retries once with a fresh token when the body contains this text.
    return res.status(403).json({ error: "Invalid CSRF Token", code: "CSRF_INVALID" });
  }
  next();
};

/**
 * Failed attempts per account (not per IP: X-Forwarded-For can be chosen by a client that reaches the app
 * directly). After `max` failures within `windowMs` the account is locked until the window ends.
 */
class FailureCounter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {
    setInterval(() => this.prune(), Math.min(windowMs, 10 * 60 * 1000)).unref();
  }

  private current(key: string) {
    const e = this.entries.get(key);
    if (e && e.resetAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e;
  }

  isLocked(key: string): boolean {
    return (this.current(key)?.count ?? 0) >= this.max;
  }

  fail(key: string) {
    const e = this.current(key);
    if (e) e.count++;
    else this.entries.set(key, { count: 1, resetAt: Date.now() + this.windowMs });
  }

  reset(key: string) {
    this.entries.delete(key);
  }

  private prune() {
    const now = Date.now();
    this.entries.forEach((e, k) => {
      if (e.resetAt <= now) this.entries.delete(k);
    });
  }
}

// 20 failed logins per account in 15 minutes (the same budget the per-IP limiter gives one address)
const loginFailures = new FailureCounter(20, 15 * 60 * 1000);
// 5 wrong current passwords per account and hour on PATCH /api/profile/password
const passwordFailures = new FailureCounter(5, 60 * 60 * 1000);

const accountKey = (username: unknown) =>
  typeof username === "string" && username.trim() ? username.trim().toLowerCase().slice(0, 64) : undefined;

/** The configured INITIAL_OWNER_USERNAME cannot be taken by public registration or a rename (squatting). */
function isReservedUsername(username: string): boolean {
  const owner = process.env.INITIAL_OWNER_USERNAME?.trim().toLowerCase();
  return !!owner && username.trim().toLowerCase() === owner;
}

/** "username" / "email" when a unique constraint on that column rejected a write, else null. */
function uniqueViolationField(err: any): "username" | "email" | null {
  const code = err?.code ?? err?.cause?.code;
  const text = `${err?.constraint ?? err?.cause?.constraint ?? ""} ${err?.detail ?? err?.cause?.detail ?? ""} ${err?.message ?? ""}`;
  const unique = code === "23505" || code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/i.test(text);
  if (!unique) return null;
  if (/email/i.test(text)) return "email";
  if (/username/i.test(text)) return "username";
  return null;
}

/**
 * Negative karma marks a banned account. Account bans from the admin panel set karma to -9999 and have an
 * expiry; once every account ban of the user has expired (or was revoked) the ban is lifted here, so temporary
 * bans really end. Negative karma without any ban record (set by hand) stays a ban.
 */
async function isKarmaBanned(user: { id: number; karma: number }): Promise<boolean> {
  if (user.karma >= 0) return false;
  try {
    const rows = await db.select().from(bans).where(and(eq(bans.userId, user.id), eq(bans.banType, "account")));
    if (rows.length === 0 || user.karma > BANNED_KARMA) return true;
    const now = Date.now();
    const active = rows.some((b: any) => {
      if (!b.isActive) return false;
      if (b.isPermanent) return true;
      if (!b.expiresAt) return true;
      const ms = b.expiresAt instanceof Date ? b.expiresAt.getTime() : Number(b.expiresAt) * 1000;
      return ms > now;
    });
    if (active) return true;
    // Restore the karma from before the (latest) ban, like revoking it does
    const latest = rows.reduce((a: any, b: any) => (Number(b.id) > Number(a.id) ? b : a));
    const karma = previousKarmaOf(latest.notes) ?? 0;
    await db.update(users).set({ karma }).where(eq(users.id, user.id));
    user.karma = karma;
    logger.info("auth", "Expired account ban lifted", { userId: user.id });
    return false;
  } catch (err) {
    logger.error("auth", "Ban expiry check failed", err, { userId: user.id });
    return true;
  }
}

/** Stores the logged-in user in a fresh session (new id: no session fixation) with a new CSRF token. */
function startSession(req: Request, user: { id: number; password: string }, cb: (err?: any) => void) {
  req.session.regenerate((err) => {
    if (err) return cb(err);
    const s = req.session as any;
    s.passport = { user: user.id };
    s.csrfToken = randomBytes(32).toString("hex");
    s.authStamp = passwordStamp(user.password);
    s.lastSeen = Date.now();
    req.session.save(cb);
  });
}

/**
 * Session, passport and the per-session CSRF token. Must run before the ban check, maintenance mode and CSRF
 * validation, which in turn run before the auth routes (registerAuthRoutes).
 */
export function setupSession(app: Express, sessionParser: any) {
  app.use(sessionParser);
  app.use(passport.initialize());
  app.use(passport.session());

  // Idle timeout (setting security.session_timeout_minutes, 0 = off)
  app.use(async (req, _res, next) => {
    const s = req.session as any;
    if (!s?.passport?.user) return next();
    try {
      const minutes = Number(await SettingsService.get("security", "session_timeout_minutes", 0)) || 0;
      const now = Date.now();
      if (minutes > 0 && typeof s.lastSeen === "number" && now - s.lastSeen > Math.max(minutes, 5) * 60_000) {
        logger.info("auth", "Session ended after inactivity", { userId: s.passport.user });
        return req.logout((err) => next(err));
      }
      // Writing the session on every request would be expensive; once a minute is precise enough.
      if (typeof s.lastSeen !== "number" || now - s.lastSeen > 60_000) s.lastSeen = now;
    } catch (err) {
      logger.error("auth", "Idle timeout check failed", err);
    }
    next();
  });

  // CSRF Token Initialization
  app.use((req, _res, next) => {
    if (req.session && !(req.session as any).csrfToken) {
      (req.session as any).csrfToken = randomBytes(32).toString("hex");
    }
    next();
  });

  passport.use(
    new LocalStrategy({ passReqToCallback: true }, async (req, username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          // Same bcrypt cost as for an existing account, so the answer time does not reveal the username.
          await burnPasswordCheck(password);
          logger.authEvent({
            event: 'login_failed',
            username,
            reason: "User not found",
          });
          activityLogger.log({
            action: 'auth.login_failed',
            category: 'auth',
            description: `Fehlgeschlagener Login-Versuch (User not found)`,
            severity: 'warning',
            status: 'failure',
            metadata: { username: String(username).slice(0, 100) },
            req,
          });
          return done(null, false, { message: "Invalid username or password" });
        }

        const { isValid, needsRehash } = await verifyPassword(password, user.password);
        if (!isValid) {
          logger.authEvent({
            event: 'login_failed',
            userId: user.id,
            username: user.username,
            reason: "Invalid password",
          });
          activityLogger.log({
            userId: user.id,
            action: 'auth.login_failed',
            category: 'auth',
            description: `Fehlgeschlagener Login-Versuch für ${user.username}`,
            severity: 'warning',
            status: 'failure',
            metadata: { username },
            req,
          });
          return done(null, false, { message: "Invalid username or password" });
        }

        // Check if user is banned (negative karma; temporary account bans end here once they expired)
        if (await isKarmaBanned(user)) {
          logger.authEvent({
            event: 'login_failed',
            userId: user.id,
            username: user.username,
            reason: 'banned_karma',
          });
          return done(null, false, {
            message: "Your account has been banned. Please contact support.",
          });
        }

        // Transparently upgrade older hashes (scrypt, bcrypt without pre-hash) to the current scheme
        if (needsRehash) {
          try {
            const newHash = await hashPassword(password);
            await storage.updateUserPassword(user.id, newHash);
            user.password = newHash;
            logger.info('auth', `Upgraded password hash`, { username: user.username });
          } catch (migrateErr) {
            logger.error('auth', `Failed to upgrade password hash`, migrateErr, { username: user.username });
          }
        }

        return done(null, user);
      } catch (err) {
        logger.error('auth', "Login error", err, { username });
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (req: Request, id: number, done: (err: any, user?: any) => void) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        logger.warn('auth', "Session invalid: User not found", { userId: id });
        return done(null, false);
      }

      // Sessions remember the password hash they were created with: after a password change all older
      // sessions (other devices, stolen cookies) end.
      if ((req.session as any)?.authStamp !== passwordStamp(user.password)) {
        logger.info('auth', "Session invalid: password changed or session predates the check", { userId: id });
        return done(null, false);
      }

      // SEC-003 FIX: Check ban status
      if (await isKarmaBanned(user)) {
        logger.warn('auth', "Session invalid: User is banned", { userId: id });
        return done(null, false); // Invalidate session
      }

      const { password: _password, ...sanitized } = user as any;

      // Enrich user with admin group if assigned
      if (user.adminGroupId) {
        try {
          const group = await storage.getAdminGroup(user.adminGroupId);
          if (group) {
            sanitized.adminGroup = group;
          }
        } catch (err) {
          logger.error('auth', "Failed to load admin group for user", err, { userId: id, groupId: user.adminGroupId });
        }
      }

      done(null, sanitized);
    } catch (err) {
      logger.error('auth', "Session error", err, { userId: id });
      done(err);
    }
  });
}

/** Login, registration, logout and the own-profile routes. Mount after ban check, maintenance mode and CSRF. */
export function registerAuthRoutes(app: Express) {
  // Per-IP limits (the address comes from X-Forwarded-For only for trusted proxies, see TRUST_PROXY)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 login attempts per window
    message: "Too many login attempts, please try again later",
  });

  // SEC-FIX [SEC-002]: Rate limiting for sensitive operations
  const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Max 5 password change attempts per hour
    message: "Too many password change attempts, please try again later",
  });

  const strictAuthLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Max 5 registration attempts per IP per hour
    message: "Too many registration attempts, please try again later",
  });

  app.post("/api/register", strictAuthLimiter, async (req, res) => {
    try {
      if ((await SettingsService.get("users", "registration_enabled", true)) === false) {
        return res.status(403).json({ error: "Registration is currently disabled", code: "REGISTRATION_DISABLED" });
      }

      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      const data = parsed.data;

      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser || isReservedUsername(data.username)) {
        return res.status(400).send("Username already exists");
      }

      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).send("Email already registered");
      }

      let user;
      try {
        user = await storage.createUser({
          username: data.username,
          email: data.email,
          password: await hashPassword(data.password),
        });
      } catch (err) {
        // Two requests for the same name at the same time: the unique constraint decides
        const field = uniqueViolationField(err);
        if (field === "username") return res.status(400).send("Username already exists");
        if (field === "email") return res.status(400).send("Email already registered");
        throw err;
      }

      // Starting karma from the admin settings (never negative: negative karma means banned)
      const startKarma = Number(await SettingsService.get("users", "default_user_karma", 0)) || 0;
      if (startKarma > 0) {
        try {
          user = await storage.updateUserProfile(user.id, { karma: Math.min(startKarma, 1_000_000) });
        } catch (err) {
          logger.error('auth', "Failed to apply default karma", err, { userId: user.id });
        }
      }

      // SECURITY FIX [AUTH-003]: Do not auto-verify email on registration if SendGrid is available
      // It will be verified either by the link or by being manually set if NO SendGrid is used
      if (!process.env.SENDGRID_API_KEY) {
        await storage.verifyUserEmail(user.id);
      }

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
        logger.error('system', "Failed to create default theme for new user", themeError, { userId: user.id });
        // Don't block registration
      }

      // Only attempt email verification if SendGrid is properly configured
      if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith("SG.")) {
        try {
          const verificationToken = await createVerificationToken(user.id);
          await sendVerificationEmail(user.email, user.username, verificationToken);
        } catch (emailErr) {
          logger.error('system', "Error sending verification email", emailErr, { userId: user.id });
          // Continue with registration even if email fails
        }
      } else {
        logger.debug("SendGrid API key not configured - skipping verification email");
      }

      const created = user;
      startSession(req, created, (err) => {
        if (err) return sendInternalError(res, err, "auth session failed");
        logger.authEvent({
          event: 'register',
          userId: created.id,
          username: created.username,
        });
        activityLogger.log({
          userId: created.id,
          userUsername: created.username,
          action: 'auth.register',
          category: 'auth',
          description: `Neuer Account registriert: ${created.username}`,
          severity: 'info',
          status: 'success',
          req
        }).catch(err => logger.error('system', 'auth.register log failed', err));
        res.status(201).json(toSelfUser(created));
      });
    } catch (err) {
      logger.error('auth', "Registration error", err);
      if (!res.headersSent) res.status(500).send("Registration failed");
    }
  });

  app.post("/api/login", authLimiter, (req, res, next) => {
    const key = accountKey(req.body?.username);
    if (key && loginFailures.isLocked(key)) {
      logger.securityEvent({
        type: "ACCOUNT_LOCKED",
        ip: req.ip || req.socket.remoteAddress,
        severity: "high",
        details: { username: key },
      });
      return res.status(429).send("Too many login attempts, please try again later");
    }

    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (key) loginFailures.fail(key);
        return res.status(401).send(info?.message || "Invalid credentials");
      }
      if (key) loginFailures.reset(key);

      startSession(req, user, (err) => {
        if (err) return next(err);
        logger.authEvent({
          event: 'login',
          userId: user.id,
          username: user.username,
          ip: req.ip,
        });
        activityLogger.log({
          userId: user.id,
          action: 'auth.login',
          category: 'auth',
          description: `User ${user.email} hat sich eingeloggt`,
          targetType: 'User',
          targetId: String(user.id),
          targetLabel: user.email,
          severity: 'info',
          status: 'success',
          metadata: { method: 'password' },
          req,
        });
        res.json(toSelfUser(user));
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const username = req.user?.username;
    const userId = req.user?.id;
    const sessionId = req.sessionID;
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((err) => {
        if (err) return next(err);
        // Sockets opened with this session stop receiving the user's events
        if (sessionId) closeSessionSockets(userId, sessionId);
        logger.authEvent({
          event: 'logout',
          userId,
          username: username,
        });
        activityLogger.log({
          userId,
          action: 'auth.logout',
          category: 'auth',
          description: `User ${username} hat sich ausgeloggt`,
          severity: 'info',
          status: 'success',
          req
        });
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      logger.debug("Unauthenticated access attempt to /api/user");
      return res.sendStatus(401);
    }
    logger.trace(`User data requested for: ${req.user?.username}`);
    res.json(toSelfUser(req.user));
  });

  app.patch("/api/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const result = updateProfileSchema.safeParse(req.body);
      if (!result.success) return sendValidationError(res, result.error);

      const update: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(result.data)) if (v !== undefined) update[k] = v;
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No valid fields provided for update", code: "NO_FIELDS" });
      }

      if (typeof update.username === "string" && update.username !== req.user!.username) {
        const existingUser = await storage.getUserByUsername(update.username);
        if ((existingUser && existingUser.id !== req.user!.id) || (!existingUser && isReservedUsername(update.username))) {
          return res.status(400).send("Username already taken");
        }
      }

      if (typeof update.email === "string") {
        const existingEmail = await storage.getUserByEmail(update.email);
        if (existingEmail && existingEmail.id !== req.user!.id) {
          return res.status(400).send("Email already registered");
        }
      }

      // Profile images must come from our own upload endpoint (or be cleared). An unchanged value
      // is always fine, so older accounts with other URLs can still save the rest of the form.
      for (const field of ["avatarUrl", "coverUrl", "profilePictureUrl"] as const) {
        const value = update[field];
        if (value === undefined || value === null || value === "" || value === (req.user as any)[field]) continue;
        if (typeof value !== "string" || !/^\/uploads\/[\w.-]+$/.test(value) || value.includes("..")) {
          return res.status(400).json({ error: "Invalid image URL", field });
        }
      }
      if (update.avatarUrl !== undefined) update.profilePictureUrl = update.avatarUrl;

      let updatedUser;
      try {
        updatedUser = await storage.updateUserProfile(req.user!.id, update as any);
      } catch (err) {
        const field = uniqueViolationField(err);
        if (field === "username") return res.status(400).send("Username already taken");
        if (field === "email") return res.status(400).send("Email already registered");
        throw err;
      }
      res.json(toSelfUser(updatedUser));
    } catch (err) {
      sendInternalError(res, err, "profile update failed");
    }
  });

  app.patch("/api/profile/password", passwordChangeLimiter, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const userId = req.user!.id;
    const key = String(userId);

    try {
      // Per account, so a stolen session cannot guess the current password from many addresses
      if (passwordFailures.isLocked(key)) {
        return res.status(429).send("Too many password change attempts, please try again later");
      }

      const result = updatePasswordSchema.safeParse(req.body);
      if (!result.success) return sendValidationError(res, result.error);

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).send("Unauthorized");
      }

      const { isValid } = await verifyPassword(result.data.currentPassword, user.password);
      if (!isValid) {
        passwordFailures.fail(key);
        return res.status(400).send("Current password is incorrect");
      }

      const updatedUser = await storage.updateUserPassword(userId, await hashPassword(result.data.newPassword));

      // Every other session ends (their stamp no longer matches); this one continues under a new id.
      startSession(req, updatedUser, (err) => {
        if (err) return sendInternalError(res, err, "password change session failed");
        closeUserSockets(userId, "Password changed");
        logger.authEvent({ event: 'password_change', userId, username: user.username } as any);
        res.json(toSelfUser(updatedUser));
      });
    } catch (err) {
      sendInternalError(res, err, "password change failed");
    }
  });
}
