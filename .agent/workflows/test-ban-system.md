---
description: How to test the user banning system with comment deletion
---

# Testing User Ban with Comment Deletion

## Test User Credentials
- **OwnerU** (Admin/Owner): Password `OWNER!!!!`
- **BannMe** (Test User): Password `BANNME!!`

## Current Status (as of 2026-01-17)
The automatic comment deletion on user ban is **NOT WORKING YET**. 

### What Works:
- Banning sets karma to -100 ✓
- Profile shows "Banned User" ✓  
- Cleanup script deletes existing banned user content ✓

### What Doesn't Work:
- Automatic deletion when banning does NOT trigger

### Debug Logging Added
The file `server/routes.ts` has detailed logging around lines 1311-1333:
- Look for `=== BAN CHECK ===` in terminal output
- Shows `updateData.karma` value and type
- Shows if deletion condition is met

## Commands

// turbo
### Start Server
```bash
$env:USE_SQLITE="true"; $env:SESSION_SECRET="dev-secret"; npm run dev
```

### Cleanup Script (manually delete banned users' content)
```bash
node scripts/db/cleanup-banned-users.cjs
```

## Test Steps
1. Start server
2. Login as OwnerU
3. Go to /admin
4. If BannMe is banned, click "Restore User" first
5. Then click "Ban User" for BannMe
6. Check terminal for `=== BAN CHECK ===` output
7. Check if comments are deleted at /users/BannMe (Comments tab)
