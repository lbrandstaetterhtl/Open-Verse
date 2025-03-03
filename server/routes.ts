import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertPostSchema, insertCommentSchema, insertReportSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.status(401).send("Unauthorized");
  };

  // Posts
  app.get("/api/posts", async (req, res) => {
    const category = req.query.category as string | undefined;
    const posts = await storage.getPosts(category);
    res.json(posts);
  });

  app.get("/api/posts/:id", async (req, res) => {
    const post = await storage.getPost(parseInt(req.params.id));
    if (!post) return res.status(404).send("Post not found");
    res.json(post);
  });

  app.post("/api/posts", isAuthenticated, async (req, res) => {
    const result = insertPostSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);
    
    const post = await storage.createPost({
      ...result.data,
      authorId: req.user!.id,
    });
    res.status(201).json(post);
  });

  app.post("/api/posts/:id/karma", isAuthenticated, async (req, res) => {
    const { karma } = req.body;
    if (typeof karma !== "number") return res.status(400).send("Invalid karma value");
    
    const post = await storage.updatePostKarma(parseInt(req.params.id), karma);
    res.json(post);
  });

  // Comments
  app.get("/api/posts/:postId/comments", async (req, res) => {
    const comments = await storage.getComments(parseInt(req.params.postId));
    res.json(comments);
  });

  app.post("/api/comments", isAuthenticated, async (req, res) => {
    const result = insertCommentSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json(result.error);
    
    const comment = await storage.createComment({
      ...result.data,
      authorId: req.user!.id,
    });
    res.status(201).json(comment);
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
