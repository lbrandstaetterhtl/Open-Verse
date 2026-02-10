# Security Logging Notes

## Overview
A structured logging system has been implemented to capture security-relevant events. All events are logged with the prefix `[SECURITY]` and a JSON payload containing the event details.

## Event Types

### `AUTH_SUCCESS`
- **Description:** Successful user login or registration.
- **Fields:** `userId`, `details.action` (e.g., 'register')

### `AUTH_FAILURE`
- **Description:** Failed login attempt, unauthenticated access to protected resource, or admin access denial.
- **Fields:** `userId` (if available), `details.reason`, `details.username`, `details.path`, `details.ip`

### `AUTH_BANNED_ATTEMPT`
- **Description:** User with negative karma (banned) attempted to login.
- **Fields:** `userId`, `details.username`

### `CSRF_FAILURE`
- **Description:** CSRF token validation failed.
- **Fields:** `ip`, `resource` (path), `details.method`

### `ADMIN_ACCESS`
- **Description:** Successful access to admin-only areas.
- **Fields:** `userId`, `resource` (path)

### `FILE_UPLOAD_REJECTED`
- **Description:** File upload blocked due to invalid extension or MIME type.
- **Fields:** `details.originalName`, `details.mime`, `details.reason`

## Log Format
```json
[SECURITY] {
  "level": "SECURITY",
  "timestamp": "2023-10-27T10:00:00.000Z",
  "type": "AUTH_FAILURE",
  "userId": 123,
  "details": {
    "reason": "Invalid password"
  }
}
```
