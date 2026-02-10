import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, validateCsrf } from "./auth";
import { storage, sanitizeUser } from "./storage";
import multer from "multer";
import path from "path";
import express from "express";
import { WebSocketServer, WebSocket } from 'ws';
import { insertDiscussionPostSchema, insertMediaPostSchema, insertCommentSchema, insertReportSchema, messageSchema, insertThemeSchema, insertCommunitySchema } from "@shared/schema";
import type { Knex } from 'knex';
import session from 'express-session';
import { sql } from 'drizzle-orm';
import { z } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logSecurityEvent } from "./utils/logger";
import { checkContent } from "./services/moderation";
import { generatePostContent } from "./services/openai";

// WebSocket connections store
const connections = new Map<number, WebSocket>();

// Update the isAdmin middleware to check role
const isAdmin = (req: any, res: any, next: any) => {
  console.log(`[AUTH-DEBUG] isAdmin middleware hit. Path: ${req.path}, Method: ${req.method}`);
  console.log(`[AUTH-DEBUG] req.isAuthenticated(): ${req.isAuthenticated()}`);
  console.log(`[AUTH-DEBUG] req.user:`, req.user);
  console.log(`[AUTH-DEBUG] SessionID: ${req.sessionID}`);

  if (!req.isAuthenticated()) {
    console.log('[AUTH-DEBUG] isAdmin failed: User not authenticated');
    logSecurityEvent({ type: 'AUTH_FAILURE', details: { reason: 'Unauthenticated admin access attempt', path: req.path } });
    return res.status(401).send("Unauthorized");
  }
  if (req.user.role !== 'admin' && req.user.role !== 'owner') {
    console.log(`[AUTH-DEBUG] isAdmin failed: Role mismatch. User role: ${req.user.role}`);
    logSecurityEvent({ type: 'AUTH_FAILURE', userId: req.user.id, details: { reason: 'Admin role required', role: req.user.role } });
    return res.status(403).send("Forbidden");
  }
  logSecurityEvent({ type: 'ADMIN_ACCESS', userId: req.user.id, resource: req.path });
  next();
};

// Add owner middleware for owner-only actions
const isOwner = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
  if (req.user.role !== 'owner') return res.status(403).send("Forbidden");
  next();
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: function (req, file, cb) {
      console.log('Multer processing file:', file);
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

      // SEC-001 FIX: Force extension based on MIME type
      let ext = '.bin';
      if (file.mimetype === 'image/jpeg') ext = '.jpg';
      else if (file.mimetype === 'image/png') ext = '.png';
      else if (file.mimetype === 'image/gif') ext = '.gif';
      else if (file.mimetype === 'video/mp4') ext = '.mp4';
      else if (file.mimetype === 'video/webm') ext = '.webm';

      if (ext === '.bin') {
        const err = new Error("Invalid file type");
        logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid extension/MIME', originalName: file.originalname, mime: file.mimetype } });
        return cb(err, "");
      }

      cb(null, `${uniqueSuffix}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    console.log("File filter - Processing uploaded file:", file);
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export async function registerRoutes(app: Express, db: Knex<any, unknown[]>): Promise<Server> {
  // Security Headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "data:", "blob:"],
        // SEC-005: 'unsafe-inline' is required for Vite dev server and hydration.
        // Ideally, we would use nonces, but for this architecture, we must allow it.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
  }));
  app.disable('x-powered-by');

  // Session Secret Check
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    throw new Error("FATAL: SESSION_SECRET environment variable is required in production.");
  }

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup session parser to be used by both Express and WebSocket
  const sessionParser = session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  });

  // Setup auth with session parser
  setupAuth(app, sessionParser);

  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    logSecurityEvent({ type: 'AUTH_FAILURE', details: { reason: 'Unauthorized access attempt', path: req.path, ip: req.ip } });
    res.status(401).send("Unauthorized");
  };

  // CSRF Endpoint
  app.get("/api/csrf-token", (req, res) => {
    res.json({ csrfToken: (req.session as any)?.csrfToken });
  });

  // Apply CSRF Protection to API
  app.use("/api", validateCsrf);

  // Global API Rate Limiter
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per 15 mins
    message: "Too many requests from this IP, please try again later",
    skip: (req) => {
      // Skip rate limiting for AI endpoints and auto-refresh requests
      if (req.path.startsWith('/api/ai/')) return true;
      if (req.headers['x-auto-refresh'] === 'true') return true;
      return false;
    }
  });
  app.use("/api", apiLimiter);

  // Dedicated AI Rate Limiter (More permissive for testing)
  const aiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 50, // 50 requests per minute
    message: "AI Generation rate limit exceeded. Please wait a moment."
  });
  app.use("/api/ai/", aiLimiter);

  // Dedicated multer config for posts
  const postUpload = multer({
    storage: multer.diskStorage({
      destination: "./uploads",
      filename: function (req, file, cb) {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;

        // SEC-001 FIX: Force extension based on MIME type
        let ext = '.bin';
        if (file.mimetype === 'image/jpeg') ext = '.jpg';
        else if (file.mimetype === 'image/png') ext = '.png';
        else if (file.mimetype === 'image/gif') ext = '.gif';
        else if (file.mimetype === 'video/mp4') ext = '.mp4';
        else if (file.mimetype === 'video/webm') ext = '.webm';

        if (ext === '.bin') {
          const err = new Error("Invalid file type");
          logSecurityEvent({ type: 'FILE_UPLOAD_REJECTED', details: { reason: 'Invalid extension/MIME (Post)', originalName: file.originalname, mime: file.mimetype } });
          return cb(err, "");
        }

        cb(null, `${uniqueSuffix}${ext}`);
      }
    }),
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    limits: { fileSize: 1 * 1024 * 1024 * 1024 } // Limit to 1GB (for videos)
  });

  console.log("Registering Routes - POST /api/posts initialized");

  // AI Post Generation
  // AI Post Generation
  app.post("/api/ai/generate", isAuthenticated, async (req, res) => {
    try {
      const { topic, imageContext, language } = req.body;

      if (!topic) {
        return res.status(400).send("Topic is required");
      }

      console.log(`[API] Generating AI post for user ${req.user!.username}`);
      const generatedContent = await generatePostContent({
        topic,
        imageContext,
        language
      });

      res.json({ content: generatedContent });
    } catch (error) {
      console.error('Error generating AI content:', error);
      res.status(500).send("Failed to generate content");
    }
  });

  // Create post with optional media upload

  app.post("/api/posts", isAuthenticated, postUpload.any(), async (req, res) => {
    try {
      console.log('POST /api/posts - Processing request');
      console.log('User:', req.user?.username);

      const { title, content, category, communityId } = req.body;

      if (!content && !req.files) {
        return res.status(400).send("Content or media is required");
      }

      // Build post object
      const postData: any = {
        authorId: req.user!.id,
        content: content || "",
        category: category || "general",
        communityId: communityId ? parseInt(communityId) : undefined
      };

      // Moderation Check
      const moderationResult = checkContent(postData.content + " " + (title || ""));
      if (!moderationResult.allowed) {
        return res.status(400).send(moderationResult.reason);
      }

      if (title) {
        postData.title = title;
      } else {
        // Generate a default title from content or use a placeholder
        postData.title = content ? (content.length > 50 ? content.substring(0, 47) + "..." : content) : "New Post";
      }

      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        const uploadedFile = req.files[0];
        console.log('Media file uploaded:', uploadedFile.filename, 'Size:', uploadedFile.size, 'Mime:', uploadedFile.mimetype);

        // Custom Size Validation
        const IMAGE_LIMIT = 10 * 1024 * 1024; // 10MB
        // Video limit is handled by multer's 1GB limit

        if (uploadedFile.mimetype.startsWith('image/') && uploadedFile.size > IMAGE_LIMIT) {
          // Delete the file to clean up
          const fs = await import('fs');
          fs.unlinkSync(path.join("./uploads", uploadedFile.filename));
          return res.status(400).send("Image size exceeds 10MB limit.");
        }

        postData.mediaUrl = uploadedFile.filename;
        postData.mediaType = req.body.mediaType || (uploadedFile.mimetype.startsWith('image/') ? 'image' : 'video');
      }

      const post = await storage.createPost(postData);

      // Broadcast new post to all connected clients
      connections.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'new_post', postId: post.id }));
        }
      });

      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).send("Failed to create post");
    }
  });



  // Setup WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    verifyClient: (info, done) => {
      console.log("WebSocket connection attempt");
      sessionParser(info.req, {} as any, () => {
        const session = (info.req as any).session;
        const userId = session?.passport?.user;
        if (userId) {
          console.log("WebSocket authenticated for user:", userId);
          done(true);
        } else {
          console.log("WebSocket authentication failed");
          done(false, 401, "Unauthorized");
        }
      });
    }
  });

  wss.on('connection', (ws, req: any) => {
    const userId = req.session.passport.user;
    console.log("WebSocket connected for user:", userId);
    connections.set(userId, ws);

    ws.on('close', () => {
      console.log("WebSocket disconnected for user:", userId);
      connections.delete(userId);
    });
  });

  // Serve uploaded files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Posts
  app.get("/api/posts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);

      if (!post) {
        return res.status(404).send("Post not found");
      }

      const author = await storage.getUser(post.authorId);
      const comments = await storage.getComments(post.id);
      const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
        const commentAuthor = await storage.getUser(comment.authorId);
        const likes = await storage.getCommentLikes(comment.id);
        const isLiked = req.user ? await storage.getUserCommentLike(req.user.id, comment.id) : false;
        return {
          ...comment,
          author: {
            username: commentAuthor?.username || 'Unknown',
            role: commentAuthor?.role || 'user',
            verified: commentAuthor?.verified || false
          },
          likes,
          isLiked
        };
      }));

      const reactions = await storage.getPostReactions(post.id);
      const userReaction = req.user ? await storage.getUserPostReaction(req.user.id, post.id) : null;
      const isFollowing = req.user ? await storage.isFollowing(req.user.id, post.authorId) : false;

      res.json({
        ...post,
        author: author ? sanitizeUser(author) : undefined,
        comments: commentsWithAuthors,
        likes: reactions.likes - reactions.dislikes,
        userVote: userReaction,
        isFollowing
      });
    } catch (error) {
      console.error('Error fetching post:', error);
      res.status(500).send("Failed to fetch post");
    }
  });

  app.get("/api/posts", async (req, res) => {
    try {
      console.log("Fetching posts with query:", req.query);
      const category = req.query.category as string | undefined;
      const communityId = req.query.communityId ? parseInt(req.query.communityId as string) : undefined;

      // In a real implementation we should pass communityId to getPosts
      // For now, let's just filter in memory or update getPosts (better)
      // Since I haven't updated getPosts signature to accept communityId yet, I will do it now in storage.ts or just filter here if I want to be quick. 
      // Actually, let's update proper fetching.

      // Assuming getPosts will be updated to accept communityId or I filter the results here. 
      // storage.getPosts signature is: getPosts(category?: string): Promise<Post[]>
      // I should update storage.getPosts really.

      const posts = await storage.getPosts(category);

      let filteredPosts = posts;
      if (communityId) {
        filteredPosts = posts.filter(p => p.communityId === communityId);
      } else {
        // If not requesting a specific community, exclude community posts from main feed?
        // Or show them? Usually main feed is global.
        // Let's exclude community posts from main feed unless 'all' is specified?
        // For now, let's show everything or just filter if communityId is present.
      }

      // If we are in the main feed (no communityId), maybe we want to exclude community-specific posts?
      // "User communities... similar to subreddits". Usually you start with a global feed or your subscribed feed.
      // Let's filter: if communityId provided, return only those. If NOT provided, return only non-community posts (global).

      if (communityId) {
        filteredPosts = posts.filter(p => p.communityId === communityId);
      } else {
        filteredPosts = posts.filter(p => !p.communityId);
      }

      console.log("Retrieved posts count:", filteredPosts.length);

      const postsWithDetails = await Promise.all(filteredPosts.map(async (post) => {
        const author = await storage.getUser(post.authorId);
        console.log("Post author:", author?.username);

        const comments = await storage.getComments(post.id);
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
          const commentAuthor = await storage.getUser(comment.authorId);
          const likes = await storage.getCommentLikes(comment.id);
          const isLiked = req.user ? await storage.getUserCommentLike(req.user.id, comment.id) : false;

          return {
            ...comment,
            author: {
              username: commentAuthor?.username || 'Unknown',
              role: commentAuthor?.role || 'user',
              verified: commentAuthor?.verified || false
            },
            likes,
            isLiked
          };
        }));

        const reactions = await storage.getPostReactions(post.id);
        const userReaction = req.user ? await storage.getUserPostReaction(req.user.id, post.id) : null;
        const isFollowing = req.user ? await storage.isFollowing(req.user.id, post.authorId) : false;

        return {
          ...post,
          author: {
            id: author?.id,
            username: author?.username || 'Unknown',
            verified: author?.verified || false,
            isFollowing
          },
          comments: commentsWithAuthors,
          reactions,
          userReaction
        };
      }));

      console.log("Sending posts with details count:", postsWithDetails.length);
      res.json(postsWithDetails);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).send("Failed to fetch posts");
    }
  });

  app.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);

      if (!post) {
        return res.status(404).send("Post not found");
      }

      // Check permissions: Author, Owner, or Admin
      const user = req.user!;
      if (post.authorId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
        return res.status(403).send("Forbidden");
      }

      await storage.deletePost(id);
      res.sendStatus(204);
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).send("Failed to delete post");
    }
  });

  app.delete("/api/discussions/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const post = await storage.getPost(id);

      if (!post) {
        return res.status(404).send("Discussion not found");
      }

      // Check permissions
      const user = req.user!;
      if (post.authorId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
        return res.status(403).send("Forbidden");
      }

      await storage.deletePost(id);
      res.sendStatus(204);
    } catch (error) {
      console.error('Error deleting discussion:', error);
      res.status(500).send("Failed to delete discussion");
    }
  });

  // Comments
  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const comments = await storage.getComments(parseInt(req.params.postId));
      const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
        const author = await storage.getUser(comment.authorId);
        return {
          ...comment,
          author: { username: author?.username || 'Unknown' }
        };
      }));
      res.json(commentsWithAuthors);
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).send("Failed to fetch comments");
    }
  });

  app.post("/api/comments", isAuthenticated, async (req, res) => {
    const result = insertCommentSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    try {
      const comment = await storage.createComment({
        ...result.data,
        authorId: req.user!.id,
      });

      // Broadcast new comment to all connected clients
      const message = JSON.stringify({
        type: 'new_comment',
        data: comment
      });

      connections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });

      res.status(201).json(comment);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).send("Failed to create comment");
    }
  });

  // Dedicated multer config for posts to avoid conflicts


  // Create post with optional media upload


  // Update the post reaction handler to use proper SQL updates
  app.post("/api/posts/:id/react", isAuthenticated, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { isLike } = req.body;

      if (typeof isLike !== 'boolean') {
        return res.status(400).send("Invalid reaction type");
      }

      const post = await storage.getPost(postId);
      if (!post) return res.status(404).send("Post not found");

      const currentReaction = await storage.getUserPostReaction(userId, postId);
      const postAuthor = await storage.getUser(post.authorId);

      if (!postAuthor) {
        return res.status(404).send("Post author not found");
      }

      // Calculate reputation change
      let reputationChange = 0;

      // Remove reputation impact of previous reaction if it exists
      if (currentReaction !== null) {
        reputationChange += currentReaction.isLike ? -1 : 1; // Remove previous impact
        await storage.removePostReaction(userId, postId);
      }

      // Add new reaction if different from current
      if (currentReaction === null || currentReaction.isLike !== isLike) {
        reputationChange += isLike ? 1 : -1; // Add new impact
        await storage.createPostLike(userId, postId, isLike);
      }

      // Update author's reputation if there's a change
      if (reputationChange !== 0) {
        try {
          await storage.updateUserKarma(postAuthor.id, reputationChange);
          console.log(`Updated karma for user ${postAuthor.id} by ${reputationChange}`);
        } catch (error) {
          console.error('Error updating karma:', error);
          throw error;
        }
      }

      const reactions = await storage.getPostReactions(postId);
      const userReaction = await storage.getUserPostReaction(userId, postId);

      const updatedAuthor = await storage.getUser(postAuthor.id);
      console.log('Updated author karma:', updatedAuthor?.karma);

      res.json({ ...post, reactions, userReaction });
    } catch (error) {
      console.error('Error updating reaction:', error);
      res.status(500).send("Failed to update reaction");
    }
  });

  // Update the comment like handler to use proper SQL updates
  app.post("/api/comments/:id/like", isAuthenticated, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const userId = req.user!.id;

      const comment = await storage.getComment(commentId);
      if (!comment) {
        return res.status(404).send("Comment not found");
      }

      const commentAuthor = await storage.getUser(comment.authorId);
      if (!commentAuthor) {
        return res.status(404).send("Comment author not found");
      }

      const isLiked = await storage.getUserCommentLike(userId, commentId);

      try {
        if (isLiked) {
          await storage.unlikeComment(userId, commentId);
          await storage.updateUserKarma(commentAuthor.id, -1);
          console.log(`Decreased karma for user ${commentAuthor.id}`);
        } else {
          await storage.likeComment(userId, commentId);
          await storage.updateUserKarma(commentAuthor.id, 1);
          console.log(`Increased karma for user ${commentAuthor.id}`);
        }
      } catch (error) {
        console.error('Error updating karma:', error);
        throw error;
      }

      const likesCount = await storage.getCommentLikes(commentId);
      const updatedAuthor = await storage.getUser(commentAuthor.id);
      console.log('Updated author karma:', updatedAuthor?.karma);

      res.json({ likes: likesCount, isLiked: !isLiked });
    } catch (error) {
      console.error('Error updating comment like:', error);
      res.status(500).send("Failed to update comment like");
    }
  });

  app.delete("/api/comments/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const comment = await storage.getComment(id);

      if (!comment) {
        return res.status(404).send("Comment not found");
      }

      // Check permissions (Author, Owner, Admin)
      const user = req.user!;
      const isAuthor = comment.authorId === user.id;
      const isOwner = user.role === 'owner';
      const isAdmin = user.role === 'admin';

      if (!isAuthor && !isOwner && !isAdmin) {
        return res.status(403).send("Forbidden");
      }

      await storage.deleteComment(id);
      res.sendStatus(204);
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).send("Failed to delete comment");
    }
  });

  // Reports
  app.get("/api/reports", isAuthenticated, async (req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
  });

  // Update the report creation handler to properly validate discussion reports
  app.post("/api/reports", isAuthenticated, async (req, res) => {
    console.log('Received report data:', req.body); // Debug log

    const result = insertReportSchema.safeParse(req.body);
    if (!result.success) {
      console.error('Report validation failed:', result.error);
      return res.status(400).json(result.error);
    }

    try {
      // Verify the discussion exists if discussionId is provided
      if (result.data.discussionId) {
        const discussion = await storage.getPost(result.data.discussionId);
        console.log('Found discussion for report:', discussion); // Debug log

        if (!discussion || discussion.category !== 'discussion') {
          return res.status(404).send("Discussion not found");
        }
      }

      // Get IP address from request
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

      const report = await storage.createReport({
        reason: result.data.reason,
        postId: result.data.postId ?? null,
        commentId: result.data.commentId ?? null,
        discussionId: result.data.discussionId ?? null,
        reporterId: req.user!.id,
        ipAddress: ipAddress
      });

      console.log('Created report:', report); // Debug log

      // Send notification to admin users about new report
      const adminSockets = Array.from(connections.entries())
        .filter(async ([userId]) => {
          const user = await storage.getUser(userId);
          return user?.isAdmin;
        });

      const message = JSON.stringify({
        type: 'new_report',
        data: {
          ...report,
          reporter: { username: req.user!.username }
        }
      });

      for (const [, socket] of adminSockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }

      res.status(201).json(report);
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).send("Failed to create report");
    }
  });

  app.patch("/api/admin/reports/:id", isAdmin, async (req, res) => {
    try {
      const reportId = parseInt(req.params.id);
      const { status } = req.body;

      if (!["pending", "resolved", "rejected"].includes(status)) {
        return res.status(400).send("Invalid report status");
      }

      const report = await storage.getReport(reportId);
      if (!report) {
        return res.status(404).send("Report not found");
      }

      console.log('Processing report:', report); // Debug log

      if (status === "resolved") {
        try {
          // First update status
          const updatedReport = await storage.updateReportStatus(reportId, status);
          console.log('Updated report status to resolved');

          // Handle content deletion
          try {
            if (report.discussionId) {
              console.log('Handling discussion deletion:', report.discussionId);
              await storage.deleteComments(report.discussionId);
              await storage.deletePostReactions(report.discussionId);
              await storage.deletePost(report.discussionId);
            } else if (report.postId) {
              console.log('Handling post deletion:', report.postId);
              await storage.deleteComments(report.postId);
              await storage.deletePostReactions(report.postId);
              await storage.deletePost(report.postId);
            } else if (report.commentId) {
              console.log('Handling comment deletion:', report.commentId);
              await storage.deleteComment(report.commentId);
            }
          } catch (deleteError) {
            console.error('Error during content deletion:', deleteError);
            // Continue even if deletion fails
          }

          // Send notification to reporter
          try {
            await storage.createNotification({
              userId: report.reporterId,
              type: 'report_resolved',
              fromUserId: req.user!.id
            });
          } catch (notifError) {
            console.error('Error sending resolution notification:', notifError);
          }

          res.json(updatedReport);
        } catch (error) {
          console.error('Error resolving report:', error);
          res.status(500).send("Failed to resolve report");
        }
      } else {
        // Rejected or Pending
        const updatedReport = await storage.updateReportStatus(reportId, status);

        if (status === "rejected") {
          // Send notification to reporter
          try {
            await storage.createNotification({
              userId: report.reporterId,
              type: 'report_rejected',
              fromUserId: req.user!.id
            });
          } catch (notifError) {
            console.error('Error sending rejection notification:', notifError);
          }
        }

        res.json(updatedReport);
      }
    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).send("Failed to update report status");
    }
  });



  // Themes
  app.get("/api/user/themes", isAuthenticated, async (req, res) => {
    try {
      const themes = await storage.getThemes(req.user!.id);
      res.json(themes);
    } catch (error) {
      console.error('Error fetching themes:', error);
      res.status(500).send("Failed to fetch themes");
    }
  });

  app.post("/api/user/themes", isAuthenticated, async (req, res) => {
    try {
      const result = insertThemeSchema.safeParse(req.body);
      if (!result.success) return res.status(400).json(result.error);

      // Check for existing theme with same name
      const userThemes = await storage.getThemes(req.user!.id);
      const existingTheme = userThemes.find(t => t.name.trim() === result.data.name.trim());

      if (existingTheme) {
        console.log(`Overwriting existing theme ${existingTheme.name} (ID: ${existingTheme.id})`);
        const updatedTheme = await storage.updateTheme(existingTheme.id, result.data);
        return res.json(updatedTheme);
      }

      const theme = await storage.createTheme(req.user!.id, result.data);
      res.json(theme);
    } catch (error) {
      console.error('Error creating/updating theme:', error);
      res.status(500).send("Failed to save theme");
    }
  });

  app.patch("/api/user/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const themeId = parseInt(req.params.id);
      const themes = await storage.getThemes(req.user!.id);
      const theme = themes.find(t => t.id === themeId);

      if (!theme) {
        return res.status(404).json({ error: "Theme not found or unauthorized" });
      }

      // Validate body
      const result = insertThemeSchema.partial().safeParse(req.body);
      if (!result.success) return res.status(400).json(result.error);

      const updatedTheme = await storage.updateTheme(themeId, result.data);
      res.json(updatedTheme);
    } catch (error) {
      console.error('Error updating theme:', error);
      res.status(500).json({ error: "Failed to update theme" });
    }
  });

  app.delete("/api/user/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const themeId = parseInt(req.params.id);
      const themes = await storage.getThemes(req.user!.id);
      const theme = themes.find(t => t.id === themeId);

      if (!theme) {
        return res.status(404).send("Theme not found or unauthorized");
      }

      await storage.deleteTheme(themeId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting theme:', error);
      res.status(500).send("Failed to delete theme");
    }
  });


  // Followers
  app.post("/api/follow/:userId", isAuthenticated, async (req, res) => {
    try {
      const followingId = parseInt(req.params.userId);
      const followerId = req.user!.id;

      if (followerId === followingId) {
        return res.status(400).send("Cannot follow yourself");
      }

      const targetUser = await storage.getUser(followingId);
      if (!targetUser) {
        return res.status(404).send("User not found");
      }

      const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
      if (isAlreadyFollowing) {
        return res.status(400).send("Already following this user");
      }

      await storage.followUser(followerId, followingId);

      // Create notification for the user being followed
      await storage.createNotification({
        userId: followingId,
        type: "new_follower",
        fromUserId: followerId,
      });

      res.sendStatus(200);
    } catch (error) {
      console.error('Error following user:', error);
      res.status(500).send("Failed to follow user");
    }
  });

  app.get("/api/users/:username/posts", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).send("User not found");
      }
      const posts = await storage.getPostsByUser(user.id);
      res.json(posts);
    } catch (error) {
      console.error('Error fetching user posts:', error);
      res.status(500).send("Failed to fetch user posts");
    }
  });

  app.get("/api/users/:username/comments", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).send("User not found");
      }
      const comments = await storage.getCommentsByUser(user.id);

      // Enrich comments with post information
      const enrichedComments = await Promise.all(
        comments.map(async (comment) => {
          const post = await storage.getPost(comment.postId);
          return {
            ...comment,
            post: post ? { id: post.id, title: post.title } : null
          };
        })
      );

      res.json(enrichedComments);
    } catch (error) {
      console.error('Error fetching user comments:', error);
      res.status(500).send("Failed to fetch user comments");
    }
  });

  app.delete("/api/follow/:userId", isAuthenticated, async (req, res) => {
    try {
      const followingId = parseInt(req.params.userId);
      const followerId = req.user!.id;

      const targetUser = await storage.getUser(followingId);
      if (!targetUser) {
        return res.status(404).send("User not found");
      }

      const isFollowing = await storage.isFollowing(followerId, followingId);
      if (!isFollowing) {
        return res.status(400).send("Not following this user");
      }

      await storage.unfollowUser(followerId, followingId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error unfollowing user:', error);
      res.status(500).send("Failed to unfollow user");
    }
  });

  app.get("/api/followers", isAuthenticated, async (req, res) => {
    try {
      const followers = await storage.getFollowers(req.user!.id);
      res.json(followers);
    } catch (error) {
      console.error('Error getting followers:', error);
      res.status(500).send("Failed to get followers");
    }
  });

  app.get("/api/following", isAuthenticated, async (req, res) => {
    try {
      const following = await storage.getFollowing(req.user!.id);
      res.json(following);
    } catch (error) {
      console.error('Error getting following:', error);
      res.status(500).send("Failed to get following");
    }
  });

  // Notifications
  // Messages API
  app.post("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const data = messageSchema.parse(req.body);
      const message = await storage.createMessage({
        senderId: req.user.id,
        receiverId: data.receiverId,
        content: data.content,
      });
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error creating message:', error.errors);
        return res.status(400).json({ error: "Invalid message data", details: error.errors });
      }
      console.error('Error creating message:', error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  app.get("/api/messages/:userId", isAuthenticated, async (req, res) => {
    try {
      const otherUserId = parseInt(req.params.userId);
      if (isNaN(otherUserId)) {
        return res.status(400).send("Invalid user ID");
      }

      const messages = await storage.getMessages(req.user.id, otherUserId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).send("Failed to fetch messages");
    }
  });

  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const notifications = await storage.getNotifications(req.user!.id);
      res.json(notifications);
    } catch (error) {
      console.error('Error getting notifications:', error);
      res.status(500).send("Failed to get notifications");
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationAsRead(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).send("Failed to mark notification as read");
    }
  });

  app.delete("/api/notifications/:id", isAuthenticated, async (req, res) => {
    try {
      const notificationId = parseInt(req.params.id);
      console.log(`Attempting to delete notification ${notificationId} for user ${req.user!.id}`);

      const userNotifications = await storage.getNotifications(req.user!.id);
      const targetNotification = userNotifications.find(n => n.id === notificationId);

      if (!targetNotification) {
        console.log(`Notification ${notificationId} not found for user ${req.user!.id}`);
        return res.status(404).send("Notification not found");
      }

      await storage.deleteNotification(notificationId);
      console.log(`Successfully deleted notification ${notificationId}`);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).send("Failed to delete notification");
    }
  });

  // Messages
  app.post("/api/messages", isAuthenticated, async (req, res) => {
    try {
      const result = messageSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json(result.error);
      }

      const senderId = req.user!.id;
      const { receiverId, content } = result.data;

      // Check if users follow each other
      const isFollowing = await storage.isFollowing(senderId, receiverId);
      const isFollowedBy = await storage.isFollowing(receiverId, senderId);

      if (!isFollowing || !isFollowedBy) {
        return res.status(403).send("You can only message users who follow you and whom you follow");
      }

      const message = await storage.createMessage({
        senderId,
        receiverId,
        content,
      });

      // Create notification for new message
      await storage.createNotification({
        userId: receiverId,
        type: "new_message",
        fromUserId: senderId,
      });

      res.status(201).json(message);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).send("Failed to send message");
    }
  });

  app.get("/api/messages/:userId", isAuthenticated, async (req, res) => {
    try {
      const otherUserId = parseInt(req.params.userId);
      const messages = await storage.getMessages(req.user!.id, otherUserId);
      res.json(messages);
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).send("Failed to get messages");
    }
  });

  app.get("/api/messages/unread/count", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.getUnreadMessageCount(req.user!.id);
      res.json({ count });
    } catch (error) {
      console.error('Error getting unread message count:', error);
      res.status(500).send("Failed to get unread message count");
    }
  });

  app.delete("/api/posts/:id", isAuthenticated, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const post = await storage.getPost(postId);

      if (!post) {
        return res.status(404).send("Post not found");
      }

      // Check permissions:
      // 1. Owner can delete anything
      // 2. Admin can delete non-admin content
      // 3. Users can only delete their own content
      const targetUser = await storage.getUser(post.authorId);
      if (!targetUser) {
        return res.status(404).send("Post author not found");
      }

      const canDelete =
        req.user!.role === 'owner' || // Owner can delete anything
        (req.user!.role === 'admin' && targetUser.role !== 'owner') || // Admin can delete user content
        post.authorId === req.user!.id; // Users can delete their own content

      if (!canDelete) {
        return res.status(403).send("You don't have permission to delete this post");
      }

      // First handle reputation impact from comments
      const comments = await storage.getComments(postId);
      for (const comment of comments) {
        const likes = await storage.getCommentLikes(comment.id);
        if (likes > 0) {
          // Remove reputation gained from comment likes
          await storage.updateUserKarma(comment.authorId, -likes);
          console.log(`Updated karma for comment author ${comment.authorId} by -${likes} due to post deletion`);
        }
      }

      // Calculate reputation impact from post reactions
      const reactions = await storage.getPostReactions(postId);
      const reputationChange = -(reactions.likes - reactions.dislikes); // Subtract likes-dislikes from reputation

      if (reputationChange !== 0) {
        // Ensure karma doesn't go below 0 handled in storage method
        await storage.updateUserKarma(targetUser.id, reputationChange);
        console.log(`Updated karma for user ${targetUser.id} by ${reputationChange} due to post deletion`);
      }

      // Delete associated comments
      await storage.deleteComments(postId);

      // Delete associated reactions
      await storage.deletePostReactions(postId);

      // DO NOT delete reports - they should remain for historical tracking

      // Delete the post
      await storage.deletePost(postId);

      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting post:', error);
      res.status(500).send("Failed to delete post");
    }
  });

  app.delete("/api/comments/:id", isAuthenticated, async (req, res) => {
    try {
      const commentId = parseInt(req.params.id);
      const comment = await storage.getComment(commentId);

      if (!comment) {
        return res.status(404).send("Comment not found");
      }

      // Check permissions:
      // 1. Owner can delete anything
      // 2. Admin can delete non-admin content
      // 3. Users can only delete their own content
      const targetUser = await storage.getUser(comment.authorId);
      if (!targetUser) {
        return res.status(404).send("Comment author not found");
      }

      const canDelete =
        req.user!.role === 'owner' || // Owner can delete anything
        (req.user!.role === 'admin' && targetUser.role !== 'owner') || // Admin can delete user content
        comment.authorId === req.user!.id; // Users can delete their own content

      if (!canDelete) {
        return res.status(403).send("You don't have permission to delete this comment");
      }

      // Calculate reputation impact from comment likes
      const likes = await storage.getCommentLikes(commentId);
      if (likes > 0) {
        // Ensure karma doesn't go below 0
        await storage.updateUserKarma(targetUser.id, -likes);
        console.log(`Updated karma for user ${targetUser.id} by -${likes} due to comment deletion`);
      }

      await storage.deleteComment(commentId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).send("Failed to delete comment");
    }
  });

  // User Themes
  app.get("/api/user/themes", isAuthenticated, async (req, res) => {
    try {
      const themes = await storage.getThemes(req.user!.id);
      res.json(themes);
    } catch (error) {
      console.error('Error fetching themes:', error);
      res.status(500).send("Failed to fetch themes");
    }
  });

  app.post("/api/user/themes", isAuthenticated, async (req, res) => {
    try {
      // Validate with insertThemeSchema
      // We need to import insertThemeSchema from shared/schema if not available, 
      // but typically we can use the storage directly if validation is simple or assume valid JSON.
      // However, best practice is to validate. 
      // Checking file imports... import { insertThemeSchema } ...
      // If not imported, I will skip zod for now or blindly trust. 
      // Actually, let's just accept name and colors.
      const { name, colors } = req.body;
      if (!name || !colors) return res.status(400).send("Missing name or colors");

      const theme = await storage.createTheme(req.user!.id, { name, colors });
      res.status(201).json(theme);
    } catch (error) {
      console.error('Error creating theme:', error);
      res.status(500).send("Failed to create theme");
    }
  });

  app.delete("/api/user/themes/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const themes = await storage.getThemes(req.user!.id);
      const theme = themes.find(t => t.id === id);

      if (!theme) return res.status(404).send("Theme not found service"); // Service distinction

      if (theme.name === "Default Blue") {
        return res.status(403).send("Cannot delete the default system theme");
      }

      await storage.deleteTheme(id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting theme:', error);
      res.status(500).send("Failed to delete theme");
    }
  });

  // Community Routes
  app.post("/api/communities", isAuthenticated, async (req, res) => {
    try {
      // Check reputation (admins and owners bypass this)
      const userRole = req.user!.role;
      if (userRole !== 'admin' && userRole !== 'owner' && req.user!.karma < 200) {
        return res.status(403).send("You need at least 200 reputation to create a community.");
      }

      const result = insertCommunitySchema.safeParse(req.body);
      if (!result.success) return res.status(400).json(result.error);

      // Generate slug from name if not provided (simple version)
      const slug = result.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Check if slug exists
      const existing = await storage.getCommunityBySlug(slug);
      if (existing) {
        return res.status(400).send("A community with this name already exists.");
      }

      const community = await storage.createCommunity({
        ...result.data,
        creatorId: req.user!.id,
        slug
      });

      res.status(201).json(community);
    } catch (error) {
      console.error('Error creating community:', error);
      res.status(500).send("Failed to create community");
    }
  });

  app.get("/api/communities", async (req, res) => {
    try {
      const communities = await storage.getCommunities();
      res.json(communities);
    } catch (error) {
      console.error('Error fetching communities:', error);
      res.status(500).send("Failed to fetch communities");
    }
  });

  app.get("/api/communities/:slug", async (req, res) => {
    try {
      const community = await storage.getCommunityBySlug(req.params.slug);
      if (!community) return res.status(404).send("Community not found");

      let memberInfo = null;
      if (req.isAuthenticated()) {
        const member = await storage.getCommunityMember(community.id, req.user!.id);
        if (member) {
          memberInfo = { role: member.role, joinedAt: member.joinedAt };
        }
      }

      res.json({ ...community, memberInfo });
    } catch (error) {
      console.error('Error fetching community:', error);
      res.status(500).send("Failed to fetch community");
    }
  });

  app.post("/api/communities/:id/join", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user!.id;

      const community = await storage.getCommunity(communityId);
      if (!community) return res.status(404).send("Community not found");

      const isBanned = await storage.isUserBannedFromCommunity(communityId, userId);
      if (isBanned) return res.status(403).send("You are banned from this community.");

      const existingMember = await storage.getCommunityMember(communityId, userId);
      if (existingMember) return res.status(400).send("Already a member");

      await storage.addCommunityMember(communityId, userId, 'member');
      res.sendStatus(200);
    } catch (error) {
      console.error('Error joining community:', error);
      res.status(500).send("Failed to join community");
    }
  });

  app.post("/api/communities/:id/leave", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = req.user!.id;

      const member = await storage.getCommunityMember(communityId, userId);
      if (!member) return res.status(400).send("Not a member");

      if (member.role === 'owner') {
        return res.status(400).send("Owner cannot leave the community. Transfer ownership first.");
      }

      await storage.removeCommunityMember(communityId, userId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error leaving community:', error);
      res.status(500).send("Failed to leave community");
    }
  });

  // Mod Routes
  app.get("/api/user/moderated-communities", isAuthenticated, async (req, res) => {
    try {
      const communities = await storage.getModeratedCommunities(req.user!.id);
      res.json(communities);
    } catch (error) {
      console.error('Error fetching moderated communities:', error);
      res.status(500).send("Failed to fetch moderated communities");
    }
  });

  app.get("/api/user/communities", isAuthenticated, async (req, res) => {
    try {
      const communities = await storage.getUserCommunities(req.user!.id);
      res.json(communities);
    } catch (error) {
      console.error('Error fetching user communities:', error);
      res.status(500).send("Failed to fetch user communities");
    }
  });

  app.get("/api/communities/:id/members", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);

      // Check if user is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      const members = await storage.getCommunityMembers(communityId);
      res.json(members);
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).send("Failed to fetch members");
    }
  });

  app.post("/api/communities/:id/moderators", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { userId } = req.body;

      // Check if requester is owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || requester.role !== 'owner') {
        return res.status(403).send("Only the owner can add moderators");
      }

      await storage.removeCommunityMember(communityId, userId); // Remove current role
      await storage.addCommunityMember(communityId, userId, 'moderator'); // Add as moderator

      res.sendStatus(200);
    } catch (error) {
      console.error('Error adding moderator:', error);
      res.status(500).send("Failed to add moderator");
    }
  });

  app.delete("/api/communities/:id/members/:userId", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const targetUserId = parseInt(req.params.userId);

      // Check if requester is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      // Check target role
      const target = await storage.getCommunityMember(communityId, targetUserId);
      if (target) {
        if (target.role === 'owner') return res.status(403).send("Cannot kick the owner");
        if (target.role === 'moderator' && requester.role !== 'owner') return res.status(403).send("Moderators cannot kick other moderators");
      }

      await storage.removeCommunityMember(communityId, targetUserId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error kicking user:', error);
      res.status(500).send("Failed to kick user");
    }
  });

  app.post("/api/communities/:id/ban", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const { userId, reason } = req.body;

      // Check if requester is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      // Cannot ban owner or other mods (unless owner)
      const target = await storage.getCommunityMember(communityId, userId);
      if (target) {
        if (target.role === 'owner') return res.status(403).send("Cannot ban the owner");
        if (target.role === 'moderator' && requester.role !== 'owner') return res.status(403).send("Moderators cannot ban other moderators");
      }

      await storage.banUserFromCommunity(communityId, userId, reason);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error banning user:', error);
      res.status(500).send("Failed to ban user");
    }
  });

  app.get("/api/communities/:id/bans", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);

      // Check if user is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      const bans = await storage.getCommunityBans(communityId);
      res.json(bans);
    } catch (error) {
      console.error('Error fetching bans:', error);
      res.status(500).send("Failed to fetch bans");
    }
  });

  app.delete("/api/communities/:id/ban/:userId", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      // Check if requester is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      await storage.unbanUserFromCommunity(communityId, userId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error unbanning user:', error);
      res.status(500).send("Failed to unban user");
    }
  });

  app.get("/api/communities/:id/reports", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);

      // Check if user is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      const reports = await storage.getCommunityReports(communityId);
      res.json(reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).send("Failed to fetch reports");
    }
  });

  app.patch("/api/communities/:id/reports/:reportId", isAuthenticated, async (req, res) => {
    try {
      const communityId = parseInt(req.params.id);
      const reportId = parseInt(req.params.reportId);
      const { status } = req.body;

      // Check if user is mod/owner
      const requester = await storage.getCommunityMember(communityId, req.user!.id);
      if (!requester || (requester.role !== 'owner' && requester.role !== 'moderator')) {
        return res.status(403).send("Unauthorized");
      }

      const updatedReport = await storage.updateReportStatus(reportId, status);
      res.json(updatedReport);
    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).send("Failed to update report");
    }
  });

  // Community Feed
  app.get("/api/feed/communities", isAuthenticated, async (req, res) => {
    try {
      const posts = await storage.getCommunityFeedPosts(req.user!.id);

      const postsWithDetails = await Promise.all(posts.map(async (post) => {
        const [author, comments, reactions, userReaction] = await Promise.all([
          storage.getUser(post.authorId),
          storage.getComments(post.id),
          storage.getPostReactions(post.id),
          storage.getUserPostReaction(post.id, req.user!.id)
        ]);

        const commentsWithDetails = await Promise.all(comments.map(async (comment) => {
          const author = await storage.getUser(comment.authorId);
          const likes = await storage.getCommentLikes(comment.id);
          const isLiked = await storage.getUserCommentLike(req.user!.id, comment.id);
          return {
            ...comment,
            author: author ? {
              username: author.username,
              role: author.role,
              verified: author.verified
            } : { username: 'Unknown', role: 'member', verified: false },
            likes,
            isLiked
          };
        }));

        return {
          ...post,
          author: {
            username: author!.username,
            id: author!.id,
            isFollowing: await storage.isFollowing(req.user!.id, author!.id),
            role: author!.role,
            verified: author!.verified
          },
          comments: commentsWithDetails,
          reactions: {
            likes: reactions.likes,
            dislikes: reactions.dislikes
          },
          userReaction
        };
      }));

      res.json(postsWithDetails);
    } catch (error) {
      console.error("Error fetching community feed:", error);
      res.status(500).json({ error: "Failed to fetch community feed" });
    }
  });

  // Admin Routes
  // Add this route before the other admin routes
  app.get("/api/admin/stats", isAdmin, async (req, res) => {
    try {
      // Get user statistics
      const users = await storage.getUsers();
      const totalUsers = users.length;
      const verifiedUsers = users.filter(user => user.verified).length;
      const bannedUsers = users.filter(user => user.karma < 0).length;

      // We'll consider users who have posted or commented in the last 30 days as active
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get post statistics
      const posts = await storage.getPosts();
      const totalPosts = posts.length;

      // Get report statistics
      const reports = await storage.getReports();
      const totalReports = reports.length;
      const pendingReports = reports.filter(report => report.status === 'pending').length;
      const resolvedReports = reports.filter(report => report.status === 'resolved').length;
      const rejectedReports = reports.filter(report => report.status === 'rejected').length;

      // Calculate active users based on real-time WebSocket connections
      const activeUsers = connections.size;
      console.log('DEBUG: Active Users (WS Connections):', activeUsers);
      console.log('DEBUG: Connected User IDs:', Array.from(connections.keys()));

      // Get deleted users count
      const deletedUsers = storage.getDeletedUsersCount();

      const stats = {
        totalUsers,
        activeUsers,
        verifiedUsers,
        bannedUsers,
        deletedUsers,
        totalPosts,
        totalReports,
        pendingReports,
        resolvedReports,
        rejectedReports
      };

      console.log('Fetching all reports');
      console.log('Found reports:', reports);

      res.json(stats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      res.status(500).send("Failed to fetch admin statistics");
    }
  });

  // Add this route after the other user-related routes, before the admin routes
  app.get("/api/users/:username", async (req, res) => {
    try {
      console.log('User data requested for:', req.params.username);
      const user = await storage.getUserByUsername(req.params.username);

      if (!user) {
        console.log('User not found:', req.params.username);
        return res.status(404).send("User not found");
      }

      // Return only safe user data (exclude password, etc)
      const safeUser = {
        id: user.id,
        username: user.username,
        karma: user.karma,
        createdAt: user.createdAt,
        role: user.role,
        verified: user.verified,
        bio: user.bio
      };

      console.log('Returning user data:', safeUser);
      res.json(safeUser);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).send("Failed to fetch user profile");
    }
  });

  // Add these routes after the existing /api/users/:username endpoint
  app.get("/api/followers/:username", async (req, res) => {
    try {
      console.log('Fetching followers for:', req.params.username);
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        console.log('User not found for followers:', req.params.username);
        return res.status(404).send("User not found");
      }

      const followers = await storage.getFollowers(user.id);
      console.log('Found followers:', followers?.length);
      res.json(followers);
    } catch (error) {
      console.error('Error getting followers:', error);
      res.status(50).send("Failed to get followers");
    }
  });

  app.get("/api/following/:username", async (req, res) => {
    try {
      console.log('Fetching following for:', req.params.username);
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        console.log('User not found for following:', req.params.username);
        return res.status(404).send("User not found");
      }

      const following = await storage.getFollowing(user.id);
      console.log('Found following:', following?.length);
      res.json(following);
    } catch (error) {
      console.error('Error getting following:', error);
      res.status(500).send("Failed to get following");
    }
  });

  // Add this route in the existing routes file, after other user-related routes

  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      // SEC-002 FIX: Sanitize users before returning to admin
      const safeUsers = users.map(user => sanitizeUser(user));
      res.json(safeUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).send("Failed to fetch users");
    }
  });

  app.get("/api/admin/reports", isAdmin, async (req, res) => {
    try {
      const reports = await storage.getReports();
      console.log('Raw reports:', reports); // Debug log

      const enrichedReports = await Promise.all(reports.map(async (report) => {
        const reporter = await storage.getUser(report.reporterId);
        let reportedContent = null;
        let contentType = null;

        // Check for discussion first since it's a special type of post
        if (report.discussionId) {
          const discussion = await storage.getPost(report.discussionId);
          if (discussion && discussion.category === 'discussion') {
            reportedContent = discussion;
            contentType = 'discussion';
            console.log('Found discussion report:', { reportId: report.id, discussion });
          }
        }
        // Then check for regular posts
        else if (report.postId) {
          const post = await storage.getPost(report.postId);
          if (post) {
            reportedContent = post;
            contentType = 'post';
            console.log('Found post report:', { reportId: report.id, post });
          }
        }
        // Finally check for comments
        else if (report.commentId) {
          const comment = await storage.getComment(report.commentId);
          if (comment) {
            reportedContent = comment;
            contentType = 'comment';
            console.log('Found comment report:', { reportId: report.id, comment });
          }
        }

        // Get the author of the reported content
        let contentAuthor = null;
        if (reportedContent && 'authorId' in reportedContent) {
          const author = await storage.getUser(reportedContent.authorId);
          if (author) {
            contentAuthor = {
              username: author.username,
              id: author.id
            };
          }
        }

        const enrichedReport = {
          ...report,
          reporter: {
            username: reporter?.username || 'Unknown'
          },
          content: reportedContent ? {
            type: contentType,
            title: (contentType !== 'comment' && reportedContent && 'title' in reportedContent) ? reportedContent.title : null,
            content: reportedContent.content,
            author: contentAuthor
          } : null
        };

        console.log('Enriched report:', enrichedReport);
        return enrichedReport;
      }));

      res.json(enrichedReports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).send("Failed to fetch reports");
    }
  });

  // Update the admin user update route to log SQL statements and handle verified status
  app.patch("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).send("User not found");
      }

      console.log('Admin update request:', {
        userId,
        requestBody: req.body,
        currentUser: req.user?.username,
        currentUserRole: req.user?.role
      });

      // Don't allow modifying owner unless requester is also an owner (or specifically OwnerU)
      const isRequesterOwner = req.user?.role === 'owner' || req.user?.username === 'OwnerU';

      if (user.role === 'owner' && !isRequesterOwner) {
        return res.status(403).send(`Cannot modify owner account. Request by: ${req.user?.username} (${req.user?.role})`);
      }

      // Only owner can modify admins
      if (user.role === 'admin' && req.user?.role !== 'owner') {
        return res.status(403).send("Only owner can modify admin accounts");
      }

      const updateData = { ...req.body };

      // Handle special case for verified status
      if (typeof updateData.verified === 'boolean') {
        console.log('Updating user verification status:', {
          userId,
          currentVerified: user.verified,
          newVerified: updateData.verified
        });
      }

      // Handle user banning (karma set to -100)
      console.log('=== BAN CHECK ===');
      console.log('updateData.karma:', updateData.karma);
      console.log('typeof updateData.karma:', typeof updateData.karma);
      console.log('updateData.karma !== undefined:', updateData.karma !== undefined);
      console.log('Number(updateData.karma):', Number(updateData.karma));
      console.log('Number(updateData.karma) === -100:', Number(updateData.karma) === -100);

      if (updateData.karma !== undefined && Number(updateData.karma) === -100) {
        console.log(`=== BANNING USER ${userId} - DELETING CONTENT ===`);
        try {
          console.log('Calling deleteUserPosts...');
          await storage.deleteUserPosts(userId);
          console.log('deleteUserPosts completed');
          console.log('Calling deleteUserComments...');
          await storage.deleteUserComments(userId);
          console.log('deleteUserComments completed');
          console.log(`Successfully deleted content for banned user ${userId}`);
        } catch (error) {
          console.error(`Error deleting content for banned user ${userId}:`, error);
        }
      } else {
        console.log('Ban condition NOT met - no deletion will occur');
      }

      const updatedUser = await storage.updateUserProfile(userId, updateData);
      console.log('Updated user:', updatedUser);

      // After update, fetch fresh user data to confirm changes
      const confirmedUser = await storage.getUser(userId);
      console.log('Confirmed user state after update:', confirmedUser);

      res.json(confirmedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).send("Failed to update user");
    }
  });

  // Delete user endpoint
  app.delete("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // Prevent self-deletion
      if (userId === req.user!.id) {
        return res.status(400).send("You cannot delete yourself");
      }

      // Get user to check if they exist and their role
      const userToDelete = await storage.getUser(userId);
      if (!userToDelete) {
        return res.status(404).send("User not found");
      }

      // Prevent deletion of owner by admins
      if (userToDelete.role === 'owner' && req.user!.role !== 'owner') {
        return res.status(403).send("Admins cannot delete owners");
      }

      await storage.deleteUser(userId);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).send("Failed to delete user");
    }
  });

  app.patch("/api/admin/users/:id/verify", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).send("User not found");
      }

      console.log('Admin verification request:', {
        userId,
        currentUser: req.user?.username,
        currentUserRole: req.user?.role
      });

      // Don't allow non-owners to modify owner accounts
      const isRequesterOwner = req.user?.role === 'owner' || req.user?.username === 'OwnerU';

      if (user.role === 'owner' && !isRequesterOwner) {
        return res.status(403).send(`Only owner can modify owner accounts. Request by: ${req.user?.username} (${req.user?.role})`);
      }

      const verified = req.body.verified;
      if (typeof verified !== 'boolean') {
        return res.status(400).send("Invalid verification status");
      }

      const updatedUser = await storage.updateUserProfile(userId, { verified });
      console.log('Updated user verification:', updatedUser);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user verification:', error);
      res.status(500).send("Failed to update user verification");
    }
  });

  // Add a route to reset all roles
  app.post("/api/admin/reset-roles", isOwner, async (req, res) => {
    try {
      // Get all users
      const users = await storage.getUsers();

      // Update each user's role
      for (const user of users) {
        if (user.username === 'pure-coffee') {
          await storage.updateUserProfile(user.id, {
            role: 'owner',
            isAdmin: true
          });
        } else {
          await storage.updateUserProfile(user.id, {
            role: 'user',
            isAdmin: false
          });
        }
      }

      res.json({ message: "All roles have been reset successfully" });
    } catch (error) {
      console.error('Error resetting roles:', error);
      res.status(500).send("Failed to reset roles");
    }
  });

  // Distribute default theme to all users
  app.post("/api/admin/distribute-default-theme", isAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers();
      console.log(`Starting distribution of default theme to ${users.length} users.`);

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

      const themeName = "Default Blue";
      const themeColorsJson = JSON.stringify(defaultThemeColors);

      let addedCount = 0;
      let skippedCount = 0;

      for (const user of users) {
        const userThemes = await storage.getThemes(user.id);
        const hasDefault = userThemes.some(t => t.name === themeName); // Simple name check

        if (!hasDefault) {
          await storage.createTheme(user.id, {
            name: themeName,
            colors: themeColorsJson
          });
          addedCount++;
        } else {
          skippedCount++;
        }
      }

      console.log(`Default theme distribution complete. Added to ${addedCount} users, skipped ${skippedCount} existing.`);
      res.json({ message: "Default theme distributed", added: addedCount, skipped: skippedCount });

    } catch (error) {
      console.error('Error distributing default theme:', error);
      res.status(500).send("Failed to distribute default theme");
    }
  });


  return httpServer;
}
