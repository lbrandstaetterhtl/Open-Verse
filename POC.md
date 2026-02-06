
# Proof of Concept Runbook

## SEC-001: Password Hash Leak

**Risk:** Critical
**Description:** Leaks user password hashes via `GET /api/posts/:id`.

**Prerequisites:**
1. Server running (`npm run dev`).
2. At least one post created in the system.

**Execution:**
Run the following command from the project root:

```bash
npx tsx poc/SEC-001.ts
```

**Expected Output:**
If vulnerable:
```
[*] Testing Detail View for Post ID: ...
[+] VULNERABILITY CONFIRMED: Password hash leaked in detail view!
User: ...
Hash Leaked: ...
```

If fixed:
```
[-] Detail view appears safe.
```

**Code:**
See `poc/SEC-001.ts` for the implementation.
