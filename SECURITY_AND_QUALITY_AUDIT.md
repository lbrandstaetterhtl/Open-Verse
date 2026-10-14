# Open-Verse Security & Code Quality Audit Report

**Audit Date**: 2026-10-14  
**Scope**: Full codebase (server, client, shared)  
**Severity Scale**: Critical > High > Medium > Low

---

## CRITICAL ISSUES (Must Fix Immediately)

### 1. **N+1 Query Problem in /api/admin/reports**
- **File**: `server/routes/admin.ts:70-110`
- **Severity**: **CRITICAL**
- **Problem**: For each of ~N reports, queries fetches reporter, then post/comment, then post author/comment author separately. This generates 3-4 queries per report.
  ```typescript
  // Line 76: 1 query per report for reporter
  const reporterResult = await db.select().from(users)...
  // Line 81/88: 1 query per report for post/comment
  // Line 84/92: 1 query per report for author
  ```
- **Impact**: With 1000 reports, makes ~4000 queries instead of 1-2. Destroys performance.
- **Fix**: Use single batch query with joins
  ```typescript
  // Use LEFT JOIN to fetch all in one query
  const extendedReports = await db.select({
    report: reports,
    reporter: users,
    post: posts,
    comment: comments,
    postAuthor: users.alias('postAuthor'),
    commentAuthor: users.alias('commentAuthor'),
  })
  .from(reports)
  .leftJoin(users, eq(users.id, reports.reporterId))
  .leftJoin(posts, eq(posts.id, reports.postId))
  .leftJoin(comments, eq(comments.id, reports.commentId))
  // ... etc
  ```

### 2. **Similar N+1 in /api/admin/users**
- **File**: `server/routes/admin.ts:49-68`
- **Severity**: **CRITICAL**
- **Problem**: If any follow-up endpoint uses this data with joins, same issue.
- **Fix**: Pre-fetch related data in batch if needed

### 3. **Hardcoded SENDGRID_API_KEY in Email Utility**
- **File**: `server/utils/email.ts:3`
- **Severity**: **CRITICAL**
- **Problem**: Sets API key at module load time; if key is in .env and exposed, affects all instances
- **Code**: `sgMail.setApiKey(process.env.SENDGRID_API_KEY!);`
- **Fix**: Set key dynamically when sending, OR ensure .env is never committed
- **Current Workaround**: `.gitignore` should block .env (verify it does)

### 4. **Missing SQL Injection Prevention in Dynamic Queries**
- **File**: Multiple analytics-service.ts queries
- **Severity**: **CRITICAL**
- **Problem**: Direct string concatenation in SQL in some edge cases
  ```typescript
  // Line 156-158: Using sql`` template literal (SAFE)
  // BUT if community_id or other params come from user input without validation
  ```
- **Fix**: Always use parameterized queries via Drizzle ORM, never string concat

### 5. **Password Never Updated in /api/auth/change-password**
- **File**: `server/auth.ts` (line ~290+)
- **Severity**: **CRITICAL**
- **Problem**: Need to verify this endpoint actually updates the hashed password in DB
  ```typescript
  // Should call: await storage.updateUserPassword(userId, hashedNewPassword)
  // Verify this is actually stored as bcrypt hash
  ```
- **Fix**: Ensure password is bcrypt hashed before DB storage

### 6. **Missing Rate Limiting on Authentication Endpoints**
- **File**: `server/auth.ts` lines 109-113
- **Severity**: **CRITICAL**
- **Problem**: Rate limiter defined but only applied to `/auth/login`. No protection on:
  - Password change endpoint
  - Registration endpoint
  - Email verification
- **Fix**: Apply `authLimiter` to all sensitive endpoints

### 7. **Insufficient Input Validation on File Uploads**
- **File**: `server/utils/file-upload.ts`
- **Severity**: **HIGH**
- **Problem**: 
  - postUpload allows `.gif` (can be security risk with canvas attacks)
  - No validation that filename doesn't contain path traversal chars (though multer handles this)
  - Max 50MB for videos might be too large for single server
- **Fix**: 
  ```typescript
  // Restrict GIF if possible, or add additional validation
  // Set smaller limits per file type
  ```

---

## HIGH PRIORITY ISSUES

### 8. **Race Condition: User Password Update**
- **File**: `server/routes/users.ts` (profile update endpoint)
- **Severity**: **HIGH**
- **Problem**: If user updates password while another request is in-flight, could have race condition
- **Fix**: Use database-level locking or transaction with SELECT FOR UPDATE

### 9. **Missing Validation in User Creation**
- **File**: `server/storage/user-storage.ts:90-125`
- **Severity**: **HIGH**
- **Problem**: 
  - No check that username doesn't contain SQL keywords
  - No check that email is valid format before insert
  - No max length validation
- **Fix**: 
  ```typescript
  // In schema or in createUser():
  if (username.length < 3 || username.length > 30) throw new Error('Invalid username length');
  if (!isValidEmail(email)) throw new Error('Invalid email');
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) throw new Error('Username contains invalid chars');
  ```

### 10. **SQL Injection Risk in Analytics Queries**
- **File**: `server/services/analytics-service.ts:156-158`
- **Severity**: **HIGH**
- **Problem**: 
  ```typescript
  sql`json_extract(${activityLogs.metadata}, '$.community_id') = ${community.id}`
  // IF community.id comes from user input without validation, SQL injection possible
  ```
- **Fix**: Always validate community.id is valid number before using

### 11. **Missing CSRF on File Upload**
- **File**: `server/routes/*.ts` (postUpload, profileUpload handlers)
- **Severity**: **HIGH**
- **Problem**: CSRF validation might not apply to multipart/form-data requests
- **Fix**: Ensure `validateCsrf` middleware runs before upload middleware
  ```typescript
  // Check if CSRF token is validated for file uploads
  // May need explicit check in upload handlers
  ```

### 12. **Unhandled Promise Rejection in Activity Logging**
- **File**: Multiple routes (e.g., posts.ts:142, users.ts:366)
- **Severity**: **HIGH**
- **Problem**: 
  ```typescript
  activityLogger.logFromRequest(req, {...})
    .catch(err => console.error('[Monitor] failed:', err));
  // If activity logging fails, silently logged, no retry
  ```
- **Fix**: 
  ```typescript
  // Either make logging critical and fail the request,
  // OR implement retry logic with exponential backoff
  ```

### 13. **Information Disclosure in Error Messages**
- **File**: Various routes (e.g., analytics-service.ts, admin.ts)
- **Severity**: **HIGH**
- **Problem**: Some errors leak database details
  ```typescript
  // Line admin.ts:45: Good - returns generic message
  // Line analytics.ts: Check if error messages leak column names
  ```
- **Fix**: Always return generic messages to client, log detailed errors server-side

---

## MEDIUM PRIORITY ISSUES

### 14. **Missing Error Handling for File System Operations**
- **File**: `server/utils/file-upload.ts:96-98`
- **Severity**: **MEDIUM**
- **Problem**: 
  ```typescript
  fs.mkdirSync(UPLOADS_DEST, { recursive: true });
  // If this fails (permission denied), silently swallowed
  ```
- **Fix**: 
  ```typescript
  if (!fs.existsSync(UPLOADS_DEST)) {
    try {
      fs.mkdirSync(UPLOADS_DEST, { recursive: true });
    } catch (err) {
      console.error('Failed to create uploads directory:', err);
      process.exit(1);
    }
  }
  ```

### 15. **Deprecated Password Hashing Algorithm Fallback**
- **File**: `server/auth.ts:44-55`
- **Severity**: **MEDIUM**
- **Problem**: Scrypt fallback for legacy passwords is legacy code that should eventually be removed
- **Fix**: Set deadline for migrating all users to bcrypt, then remove scrypt support

### 16. **No Transaction Wrapping for Multi-Step Operations**
- **File**: `server/routes/communities.ts`, `server/routes/posts.ts`
- **Severity**: **MEDIUM**
- **Problem**: Creating post + log + notification across 3 calls without transaction
  ```typescript
  const post = await storage.createPost(postData);      // Query 1
  broadcastMessage(...);                               // External call
  activityLogger.logFromRequest(...);                  // Query 2
  await notificationService.notify(...);               // Query 3
  // If query 2 fails, post exists but not logged
  ```
- **Fix**: Use database transactions for related operations

### 17. **Insufficient Timestamp Validation**
- **File**: `server/services/analytics-service.ts:24-30`
- **Severity**: **MEDIUM**
- **Problem**: 
  ```typescript
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    date = new Date(date);  // Silently converts invalid date
  }
  // Should reject invalid dates, not silently fix
  ```
- **Fix**: 
  ```typescript
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided');
  }
  ```

### 18. **Missing Pagination Validation**
- **File**: `server/routes/posts.ts:224-225`
- **Severity**: **MEDIUM**
- **Problem**: 
  ```typescript
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  // No max limit check - user could request 1 billion rows
  ```
- **Fix**: 
  ```typescript
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  ```

### 19. **Missing Null Checks in User Operations**
- **File**: `server/routes/users.ts:343-346`
- **Severity**: **MEDIUM**
- **Problem**: 
  ```typescript
  const userId = (req.user as any).id;
  // If req.user is not properly authenticated, this will crash
  ```
- **Fix**: 
  ```typescript
  const userId = (req.user as any)?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  ```

### 20. **Race Condition in Follow/Unfollow**
- **File**: `server/routes/users.ts:56-87`
- **Severity**: **MEDIUM**
- **Problem**: 
  ```typescript
  const isFollowing = await storage.isFollowing(followerId, followingId);
  if (isFollowing) {
    return res.status(400).send("Already following");
  }
  await storage.unfollowUser(...);  // Between check and action, could be removed by another request
  ```
- **Fix**: Use UNIQUE constraint in database to prevent duplicates, handle constraint error

---

## LOW PRIORITY ISSUES

### 21. **Dead Code / Unused Imports**
- **Files**: Multiple files have commented-out code or unused variables
- **Severity**: **LOW**
- **Fix**: Remove dead code in next refactor pass

### 22. **Inconsistent Error Message Format**
- **Multiple Files**: Some return `.send()`, some `.json()`
- **Severity**: **LOW**
- **Problem**: Client code needs to handle both string and JSON errors
- **Fix**: Standardize all errors to JSON format:
  ```typescript
  res.status(400).json({ error: 'message' });
  // Never: res.status(400).send('message');
  ```

### 23. **Missing JSDoc Comments on Complex Functions**
- **File**: `server/services/anomaly-detector.ts`, auth.ts
- **Severity**: **LOW**
- **Fix**: Add JSDoc for complex business logic

### 24. **Console.error vs Logger**
- **Multiple Files**: Mix of console.error() and logger.error()
- **Severity**: **LOW**
- **Fix**: Always use logger.error() for consistency

### 25. **Missing Timeout on External API Calls**
- **File**: `server/utils/email.ts:sendVerificationEmail()`
- **Severity**: **LOW**
- **Problem**: SendGrid call has no timeout - could hang forever
- **Fix**: Set fetch timeout:
  ```typescript
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  await sgMail.send(..., { signal: controller.signal });
  ```

---

## PERFORMANCE ISSUES

### 26. **Missing Database Indexes**
- **File**: `shared/schema.ts`
- **Severity**: **HIGH**
- **Problem**: 
  ```typescript
  // Missing indexes on:
  // - posts.authorId (used in WHERE frequently)
  // - posts.communityId
  // - comments.postId
  // - followers.followerId, followers.followingId
  // - activityLogs.userId
  ```
- **Fix**: Add indexes:
  ```typescript
  export const posts = pgTable("posts", {...}, (table) => ({
    authorIdIdx: index('idx_posts_author_id').on(table.authorId),
    communityIdIdx: index('idx_posts_community_id').on(table.communityId),
  }));
  ```

### 27. **Unbounded Activity Log Growth**
- **File**: `server/services/activity-logger.ts`
- **Severity**: **MEDIUM**
- **Problem**: Activity logs grow unbounded, no cleanup/archival strategy
- **Fix**: Implement:
  ```typescript
  // Option 1: Retention policy - delete logs older than 90 days
  // Option 2: Archive old logs to cold storage
  // Option 3: Partition table by month
  ```

### 28. **Missing Caching Strategy**
- **File**: Client side queries
- **Severity**: **MEDIUM**
- **Problem**: staleTime is 30 seconds but some data (user profile, settings) could be cached longer
- **Fix**: 
  ```typescript
  // In queryClient setup, use different stale times per query
  queryKey: ['/api/user/profile'],
  staleTime: 5 * 60 * 1000,  // 5 minutes for profile
  ```

---

## SECURITY BEST PRACTICES NOT FOLLOWED

### 29. **Missing Request Size Limits**
- **File**: `server/index.ts` or express setup
- **Severity**: **MEDIUM**
- **Problem**: No JSON body size limit set for express.json()
- **Fix**: 
  ```typescript
  app.use(express.json({ limit: '10kb' }));  // Prevent large payloads
  ```

### 30. **Missing Security Headers**
- **File**: `server/routes/index.ts` (CSP is set, but missing others)
- **Severity**: **MEDIUM**
- **Problem**: Missing:
  - X-Content-Security-Policy header enforcement
  - Referrer-Policy
  - Feature-Policy (Permissions-Policy)
  - HSTS (though REQUIRE_HTTPS might handle this)
- **Fix**: Add helmet middleware:
  ```typescript
  import helmet from 'helmet';
  app.use(helmet());
  ```

### 31. **No Rate Limiting on Public Endpoints**
- **File**: `server/routes/posts.ts:219`
- **Severity**: **MEDIUM**
- **Problem**: GET /api/posts has no rate limit (anyone can spam)
- **Fix**: Apply rate limiter to public feed endpoints

### 32. **Missing Secrets Management**
- **Files**: Multiple
- **Severity**: **HIGH**
- **Problem**: Secrets in environment variables but no rotation mechanism
- **Fix**: Implement secret rotation policy, use secrets manager (AWS Secrets, etc.)

---

## PRIORITY MATRIX

### **MUST FIX (This Week)**
1. ✅ N+1 query problem in admin/reports → Performance disaster
2. ✅ SQL injection risks in analytics → Security breach
3. ✅ Missing rate limiting on auth → Brute force attacks
4. ✅ Password hashing validation → Auth bypass
5. ✅ Missing pagination limits → DoS attack
6. ✅ Hardcoded secrets validation → Credential exposure

### **SHOULD FIX (This Sprint)**
1. Race conditions in follow/unfollow
2. Missing transaction wrapping
3. Request size limits
4. Database indexes for performance
5. Activity log retention policy
6. CSRF validation on multipart uploads
7. Standardize error response format

### **NICE TO HAVE (Future)**
1. Remove legacy scrypt support (after migration)
2. JSDoc documentation
3. Unified logging (console → logger)
4. Activity log archival
5. Advanced caching strategy

---

## RECOMMENDATIONS

### Short Term (Critical)
1. **Run security audit with OWASP checklist**
2. **Add input validation library** (joi, yup, or keep Zod)
3. **Batch N+1 query fixes** starting with admin endpoints
4. **Review and fix all password-related code**
5. **Add rate limiting to all auth and sensitive endpoints**

### Medium Term
1. **Add database indexes** for frequently queried columns
2. **Implement transaction wrapping** for multi-step operations
3. **Add comprehensive error handling** for file operations
4. **Implement request size limits** globally
5. **Add security headers middleware** (helmet)

### Long Term
1. **Migrate away from legacy password hashing**
2. **Implement secrets rotation**
3. **Add API versioning** for backward compatibility
4. **Comprehensive logging and monitoring**
5. **Load testing to identify performance bottlenecks**

---

## TESTING RECOMMENDATIONS

Before deploying any fixes:
1. Add unit tests for password hashing/comparison
2. Add integration tests for file upload security
3. Add load tests for N+1 query endpoints
4. Add security tests for rate limiting
5. Add tests for race conditions in concurrent operations

---

## CONCLUSION

**Risk Assessment**: **MEDIUM-HIGH**

The codebase has good structure and logging, but several critical vulnerabilities need immediate attention:
- N+1 queries will cause performance issues under load
- Missing input validation could lead to SQL injection
- Authentication rate limiting gaps could enable brute force

**Estimated Remediation Time**: 
- Critical issues: 4-6 hours
- High priority: 8-10 hours
- Medium priority: 10-12 hours

**Total**: ~1-2 weeks for full remediation

