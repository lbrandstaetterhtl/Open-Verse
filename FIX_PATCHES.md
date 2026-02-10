# Fix Patches

## Patch for SEC-001: Fix File Upload XSS

**Files:** `server/routes.ts`
**Goal:** Prevent HTML upload by validating file content (not just MIME) or forcing safe extensions.
**Strategy:** Force the extension to match the allowed MIME type, ignoring the user's extension.

```typescript
// server/routes.ts

// ... inside multer configuration ...
filename: function (req, file, cb) {
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
  // SEC-001 FIX: Force extension based on MIME type
  let ext = '.bin';
  if (file.mimetype === 'image/jpeg') ext = '.jpg';
  else if (file.mimetype === 'image/png') ext = '.png';
  else if (file.mimetype === 'image/gif') ext = '.gif';
  else if (file.mimetype === 'video/mp4') ext = '.mp4';
  else if (file.mimetype === 'video/webm') ext = '.webm';
  
  // Reject if not in allowlist (though fileFilter should handle this, double safety)
  if (ext === '.bin') {
     return cb(new Error("Invalid file type"));
  }
  
  cb(null, `${uniqueSuffix}${ext}`);
}
```

## Patch for SEC-002: Prevent Password Leak via Admin API

**Files:** `server/routes.ts`, `server/storage.ts`
**Goal:** Sanitize user objects before returning them in the admin API.

```typescript
// server/routes.ts

// ... in /api/admin/users route ...
app.get("/api/admin/users", isAdmin, async (req, res) => {
  try {
    const users = await storage.getUsers();
    // SEC-002 FIX: Sanitize users
    const safeUsers = users.map(user => sanitizeUser(user));
    res.json(safeUsers);
  } catch (error) {
    // ...
  }
});
```

## Patch for SEC-003: Check Ban Status in Session Deserialization

**Files:** `server/auth.ts`
**Goal:** Invalidate session if user is banned.

```typescript
// server/auth.ts

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    // SEC-003 FIX: Check ban status
    if (user.karma < 0) {
      console.log("Session invalid: User is banned:", id);
      return done(null, false); // Invalidate session
    }
    done(null, sanitizeUser(user));
  } catch (err) {
    // ...
  }
});
```

## Patch for SEC-004: Voting Race Condition

**Files:** `server/routes.ts`
**Goal:** Use database-level constraints or transactions. For SQLite/Drizzle without transactions, a simplified mutex or optimistic locking could work, but Unique Constraints are best.

*Database Migration (SQL):*
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_likes_user_post ON post_likes(user_id, post_id);
```

*Code Update (server/routes.ts):*
Handle the duplicate key error gracefully.

## Patch for SEC-005: CSP Hardening

**Files:** `server/routes.ts`
**Goal:** Remove `'unsafe-inline'`.

```typescript
// server/routes.ts

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // SEC-005 FIX: Remove 'unsafe-inline'
      scriptSrc: ["'self'"], 
      // ...
    },
  },
}));
```
