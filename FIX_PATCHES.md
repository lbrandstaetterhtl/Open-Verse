
# Fix Patches

## SEC-001: Password Hash Leak

**File:** `server/routes.ts`

**Description:**
Sanitize the `author` object before returning it in the `GET /api/posts/:id` endpoint.

```typescript
// server/routes.ts

// Import sanitizeUser
import { storage, sanitizeUser } from "./storage"; 

// ... inside app.get("/api/posts/:id", ...)

      // ...
      const author = await storage.getUser(post.authorId);
      
      // FIX: Sanitize the author object
      const safeAuthor = author ? sanitizeUser(author) : undefined;

      // ...

      res.json({
        ...post,
        author: safeAuthor, // Use safeAuthor instead of author
        comments: commentsWithAuthors,
        // ...
      });
```

**Alternative Fix:**
Update `DatabaseStorage.getUser` (SQLite path) to explicitly handle sanitization if the caller expects a safe object. However, since `auth.ts` relies on `getUser` returning the password for `comparePasswords`, a dedicated `getPublicUser` method in `storage.ts` is the cleanest architectural fix.

**Recommended Patch (Minimal):**
Modify `server/routes.ts` to call `sanitizeUser` where `author` is used publicy.

## SEC-003: Enable CSP

**File:** `server/routes.ts`

```typescript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "data:", "blob:"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for some dev tools/vite? verify
        connectSrc: ["'self'", "ws:", "wss:"], // Needed for WebSocket
      },
    },
  }));
```

## SEC-004: Remove Duplicate Route

**File:** `server/routes.ts`

Delete the `app.patch("/api/profile", ...)` block around line 686. The implementation in `server/auth.ts` (line 245) is more robust (checks for duplicates).
