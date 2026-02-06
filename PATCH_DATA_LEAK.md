# Patch 5: Prevent Data Leak (Password Hash)

**File:** `server/storage.ts`

**Description:** The storage methods return the full `User` object, including the `password` hash. This patch strips sensitive fields.

```typescript
// Helper function
function sanitizeUser(user: User): User {
  const { password, ...safeUser } = user;
  return safeUser as User;
}

// Apply to all get/create methods
// return sanitizeUser(user);
```
