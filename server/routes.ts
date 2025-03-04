import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import express from "express";
import { insertDiscussionPostSchema, insertMediaPostSchema, insertCommentSchema, insertReportSchema, messageSchema } from "@shared/schema";

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
      console.log("Creating new post with data:", req.body);
      const category = req.body.category;
      console.log("Post category:", category);

      // Validate based on category
      const schema = category === "discussion" ? insertDiscussionPostSchema : insertMediaPostSchema;
      const result = schema.safeParse(req.body);

      if (!result.success) {
        console.error("Validation error:", result.error);
        return res.status(400).json(result.error);
      }

      let mediaUrl = null;
      let mediaType = null;

      if (req.file && category !== "discussion") {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaType = req.file.mimetype.startsWith("image/") ? "image" : "video";
        console.log("Media info:", { mediaUrl, mediaType });
      }

      const post = await storage.createPost({
        ...result.data,
        authorId: req.user!.id,
        mediaUrl,
        mediaType,
      });

      console.log("Created post:", post);
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

  const httpServer = createServer(app);
  return httpServer;
}