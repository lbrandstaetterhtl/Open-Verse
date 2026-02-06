# Patch 4: Prevent Large Payload DoS

**File:** `server/index.ts` (or wherever `app.use(express.json())` is called)

**Description:** Restrict the size of JSON bodies to prevent memory exhaustion attacks.

```typescript
// Enforce body size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
```
