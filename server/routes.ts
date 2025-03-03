import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import express from "express";
import { insertDiscussionPostSchema, insertMediaPostSchema, insertCommentSchema, insertReportSchema } from "@shared/schema";

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: "./uploads",
    filename: function (req, file, cb) {
      cb(null, Date.now() + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/webm"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.status(401).send("Unauthorized");
  };

  // Serve uploaded files
  app.use("/uploads", express.static("uploads"));

  // Posts
  app.get("/api/posts", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const posts = await storage.getPosts(category);

      // Get authors for each post
      const postsWithAuthors = await Promise.all(posts.map(async (post) => {
        const author = await storage.getUser(post.authorId);
        const comments = await storage.getComments(post.id);
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
          const commentAuthor = await storage.getUser(comment.authorId);
          return {
            ...comment,
            author: { username: commentAuthor?.username || 'Unknown' }
          };
        }));
        return {
          ...post,
          author: { username: author?.username || 'Unknown' },
          comments: commentsWithAuthors
        };
      }));

      res.json(postsWithAuthors);
    } catch (error) {
      console.error('Error fetching posts:', error);
      res.status(500).send("Failed to fetch posts");
    }
  });

  app.get("/api/posts/:id", async (req, res) => {
    try {
      const post = await storage.getPost(parseInt(req.params.id));
      if (!post) return res.status(404).send("Post not found");

      const author = await storage.getUser(post.authorId);
      const comments = await storage.getComments(post.id);
      const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
        const commentAuthor = await storage.getUser(comment.authorId);
        return {
          ...comment,
          author: { username: commentAuthor?.username || 'Unknown' }
        };
      }));

      res.json({
        ...post,
        author: { username: author?.username || 'Unknown' },
        comments: commentsWithAuthors
      });
    } catch (error) {
      console.error('Error fetching post:', error);
      res.status(500).send("Failed to fetch post");
    }
  });

  app.post("/api/posts", isAuthenticated, upload.single("media"), async (req, res) => {
    const category = req.body.category;

    // Validate based on category
    const schema = category === "discussion" ? insertDiscussionPostSchema : insertMediaPostSchema;
    const result = schema.safeParse(req.body);

    if (!result.success) return res.status(400).json(result.error);

    let mediaUrl = null;
    let mediaType = null;

    if (req.file && category !== "discussion") {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaType = req.file.mimetype.startsWith("image/") ? "image" : "video";
    }

    const post = await storage.createPost({
      ...result.data,
      authorId: req.user!.id,
      mediaUrl,
      mediaType,
    });

    res.status(201).json(post);
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

      const author = await storage.getUser(comment.authorId);
      const commentWithAuthor = {
        ...comment,
        author: { username: author?.username || 'Unknown' }
      };

      res.status(201).json(commentWithAuthor);
    } catch (error) {
      console.error('Error creating comment:', error);
      res.status(500).send("Failed to create comment");
    }
  });

  app.post("/api/posts/:id/karma", isAuthenticated, async (req, res) => {
    const { karma } = req.body;
    if (typeof karma !== "number") return res.status(400).send("Invalid karma value");

    const post = await storage.updatePostKarma(parseInt(req.params.id), karma);
    res.json(post);
  });

  app.post("/api/comments/:id/karma", isAuthenticated, async (req, res) => {
    const { karma } = req.body;
    if (typeof karma !== "number") return res.status(400).send("Invalid karma value");

    const comment = await storage.updateCommentKarma(parseInt(req.params.id), karma);
    res.json(comment);
  });

  // Reports
  app.get("/api/reports", isAuthenticated, async (req, res) => {
    const reports = await storage.getReports();
    res.json(reports);
  });

  app.post("/api/reports", isAuthenticated, async (req, res) => {
    const result = insertReportSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);

    const report = await storage.createReport({
      ...result.data,
      reporterId: req.user!.id,
    });
    res.status(201).json(report);
  });

  app.post("/api/reports/:id/status", isAuthenticated, async (req, res) => {
    const { status } = req.body;
    if (typeof status !== "string") return res.status(400).send("Invalid status");

    const report = await storage.updateReportStatus(parseInt(req.params.id), status);
    res.json(report);
  });

  const httpServer = createServer(app);
  return httpServer;
}