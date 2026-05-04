# Server Migration Guide: Auto-Punishment System Fixes

If your server database (SQLite or Postgres) already contains data in the `activity_logs` or `anomaly_events` tables, you may need to run these commands to ensure the new integer-based timing logic works correctly.

## 1. Database Schema Update
The system now uses **Unix Timestamps (Integer)** for all `created_at` and `updated_at` fields to ensure stable comparisons.

### SQLite (Server)
If you are using SQLite on the server, you can run this script to convert any existing ISO strings to Unix integers:

```bash
npx tsx scripts/migrate-timestamps.ts
```

*(I have created this script in the codebase for you)*

## 2. Emergency Account Recovery
If an admin or owner account is currently frozen or shadowbanned, run this command on the server to restore access immediately:

```bash
npx tsx scripts/cleanup-bans.ts
```

## 3. Monitoring (Dry-Run Mode)
To see what the system *would* do without actually banning anyone, add this to your `.env` or Docker environment:

```env
AUTO_PUNISHMENT_DRY_RUN=true
AUTO_PUNISHMENT_WHITELIST=1,2  # User IDs that should NEVER be touched
```

## 4. Verification
After deploying, check the logs for:
- `[AutoPunishment] Default rules updated with hardened thresholds`
- `[AutoPunishment] Escalation check: ...`
- `[AutoPunishment] Account too new, downgrading to temporary freeze`
