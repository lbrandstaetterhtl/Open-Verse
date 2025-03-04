import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import express from "express";
import { WebSocketServer, WebSocket } from 'ws';
import { insertDiscussionPostSchema, insertMediaPostSchema, insertCommentSchema, insertReportSchema, messageSchema } from "@shared/schema";
import type { Knex } from 'knex';
import session from 'express-session';

// WebSocket connections store
const connections = new Map<number, WebSocket>();

// Define admin middleware at the top
const isAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) return res.status(401).send("Unauthorized");
  if (req.user.username !== 'pure-coffee') return res.status(403).send("Forbidden");
  next();
};

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

export async function registerRoutes(app: Express, db: Knex<any, unknown[]>): Promise<Server> {
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
      maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
  });

  // Setup auth with session parser
  setupAuth(app, sessionParser);

  const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) return next();
    res.status(401).send("Unauthorized");
  };

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
  app.get("/api/posts", async (req, res) => {
    try {
      console.log("Fetching posts with query:", req.query);
      const category = req.query.category as string | undefined;
      const posts = await storage.getPosts(category);
      console.log("Retrieved posts count:", posts.length);

      const postsWithDetails = await Promise.all(posts.map(async (post) => {
        const author = await storage.getUser(post.authorId);
        console.log("Post author:", author?.username);

        const comments = await storage.getComments(post.id);
        const commentsWithAuthors = await Promise.all(comments.map(async (comment) => {
          const commentAuthor = await storage.getUser(comment.authorId);
          return {
            ...comment,
            author: {
              username: commentAuthor?.username || 'Unknown'
            }
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

  app.post("/api/posts", isAuthenticated, upload.single("media"), async (req, res) => {
    try {
      const post = await storage.createPost({
        ...req.body,
        authorId: req.user!.id,
      });

      // Broadcast new post to all connected clients
      const message = JSON.stringify({
        type: 'new_post',
        data: post
      });

      connections.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });

      res.status(201).json(post);
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).send("Failed to create post");
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

  app.post("/api/posts/:id/react", isAuthenticated, async (req, res) => {
    try {
      const postId = parseInt(req.params.id);
      const userId = req.user!.id;
      const { isLike } = req.body;

      if (typeof isLike !== 'boolean') {
        return res.status(400).send("Invalid reaction type");
      }

      const currentReaction = await storage.getUserPostReaction(userId, postId);

      // Remove existing reaction if it exists
      if (currentReaction !== null) {
        await storage.removePostReaction(userId, postId);
      }

      // Add new reaction if it's different from the current one
      if (currentReaction === null || currentReaction.isLike !== isLike) {
        await storage.createPostLike(userId, postId, isLike);
      }

      const post = await storage.getPost(postId);
      if (!post) return res.status(404).send("Post not found");

      const reactions = await storage.getPostReactions(postId);
      const userReaction = await storage.getUserPostReaction(userId, postId);

      res.json({ ...post, reactions, userReaction });
    } catch (error) {
      console.error('Error updating reaction:', error);
      res.status(500).send("Failed to update reaction");
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

      const report = await storage.createReport({
        ...result.data,
        reporterId: req.user!.id,
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

      // If report is resolved, take action based on the reported content
      if (status === "resolved") {
        try {
          // First update this report's status
          await storage.updateReportStatus(reportId, status);
          console.log('Updated report status to resolved'); // Debug log

          if (report.discussionId) {
            console.log('Handling discussion deletion:', report.discussionId); // Debug log

            // Delete all comments
            await storage.deleteComments(report.discussionId);
            console.log('Deleted discussion comments'); // Debug log

            // Delete reactions
            await storage.deletePostReactions(report.discussionId);
            console.log('Deleted discussion reactions'); // Debug log

            // Delete the discussion post itself
            await storage.deletePost(report.discussionId);
            console.log('Deleted discussion post'); // Debug log
          } else if (report.postId) {
            console.log('Handling post deletion:', report.postId); // Debug log
            await storage.deleteComments(report.postId);
            await storage.deletePostReactions(report.postId);
            await storage.deletePost(report.postId);
          } else if (report.commentId) {
            console.log('Handling comment deletion:', report.commentId); // Debug log
            await storage.deleteComment(report.commentId);
          }

          res.json({ ...report, status });
        } catch (deleteError) {
          console.error('Error during content deletion:', deleteError);
          res.status(500).send(`Failed to delete reported content: ${deleteError.message}`);
        }
      } else {
        // For rejected reports, just update the status
        const updatedReport = await storage.updateReportStatus(reportId, status);
        res.json(updatedReport);
      }
    } catch (error) {
      console.error('Error updating report:', error);
      res.status(500).send("Failed to update report status");
    }
  });

  // Updated profile route
  app.patch("/api/profile", isAuthenticated, async (req, res) => {
    try {
      const updateData: Partial<{ username: string; email: string }> = {};

      if (req.body.username) {
        updateData.username = req.body.username;
      }

      if (req.body.email) {
        updateData.email = req.body.email;
      }

      const updatedUser = await storage.updateUserProfile(req.user!.id, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).send("Failed to update profile");
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

      // Check if user owns the post
      if (post.authorId !== req.user!.id) {
        return res.status(403).send("You can only delete your own posts");
      }

      // Delete associated comments
      await storage.deleteComments(postId);

      // Delete associated reactions
      await storage.deletePostReactions(postId);

      // Delete associated reports
      await storage.deleteReports(postId);

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

      // Check if user owns the comment
      if (comment.authorId !== req.user!.id) {
        return res.status(403).send("You can only delete your own comments");
      }

      await storage.deleteComment(commentId);
      res.sendStatus(200);
    } catch (error) {
      console.error('Error deleting comment:', error);
      res.status(500).send("Failed to delete comment");
    }
  });

  // Admin Routes
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getUsers(); // Use storage interface
      res.json(users);
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

        const enrichedReport = {
          ...report,
          reporter: {
            username: reporter?.username || 'Unknown'
          },
          content: reportedContent ? {
            type: contentType,
            title: contentType === 'comment' ? null : reportedContent.title,
            content: reportedContent.content
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

  // Add new admin route for banning users
  app.patch("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).send("User not found");
      }

      // Don't allow modifying admin users
      if (user.username === 'pure-coffee') {
        return res.status(403).send("Cannot modify admin user");
      }

      console.log('Admin update request:', {
        userId,
        requestBody: req.body,
        currentUser: req.user?.username
      });

      // If this is a ban action
      if (req.body.karma < 0) {
        // Send ban notification to the user if they're connected
        const userWs = connections.get(userId);
        if (userWs && userWs.readyState === WebSocket.OPEN) {
          userWs.send(JSON.stringify({
            type: 'banned',
            message: 'Your account has been banned by an administrator.'
          }));
        }

        // Delete the user's data
        await storage.deleteUser(userId);
        res.json({ message: "User banned and deleted successfully" });
      } else {
        // For non-ban updates
        const updatedUser = await storage.updateUserProfile(userId, req.body);
        console.log('Updated user:', updatedUser);
        res.json(updatedUser);
      }
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).send("Failed to update user");
    }
  });

  return httpServer;
}