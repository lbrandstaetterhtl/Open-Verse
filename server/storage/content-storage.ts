import type {
  Post,
  Comment} from "@shared/schema";
import {
  postLikes,
  comments,
  posts,
  commentLikes,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";

export class ContentStorage {
  async createPost(post: Omit<Post, "id" | "createdAt" | "karma">): Promise<Post> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const stmt = sqlite.prepare(`
        INSERT INTO posts (title, content, author_id, category, karma, media_url, media_type, community_id, created_at)
        VALUES (@title, @content, @authorId, @category, 0, @mediaUrl, @mediaType, @communityId, strftime('%s', 'now'))
      `);

      const info = stmt.run({
        title: post.title,
        content: post.content,
        authorId: post.authorId,
        category: post.category,
        mediaUrl: post.mediaUrl || null,
        mediaType: post.mediaType || null,
        communityId: post.communityId || null,
      });

      const newPost = sqlite.prepare("SELECT * FROM posts WHERE id = ?").get(info.lastInsertRowid);
      return {
        ...newPost,
        createdAt: new Date(Number(newPost.created_at) * 1000),
      };
    }

    const [newPost] = await db.insert(posts).values(post).returning();
    return newPost;
  }

  async getPosts(options: { category?: string; communityId?: number; limit?: number; offset?: number } = {}): Promise<Post[]> {
    const { category, communityId, limit = 50, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      let query = "SELECT p.* FROM posts p";
      const params: any[] = [];
      const whereClauses = [];

      if (communityId) {
        whereClauses.push("p.community_id = ?");
        params.push(communityId);
      } else {
        whereClauses.push("p.community_id IS NULL");
      }

      if (category) {
        if (category.includes(",")) {
          const categories = category.split(",").map((c: string) => c.trim());
          whereClauses.push(`p.category IN (${categories.map(() => "?").join(",")})`);
          params.push(...categories);
        } else {
          whereClauses.push("p.category = ?");
          params.push(category);
        }
      }

      if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
      }
      query += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = sqlite.prepare(query).all(...params) as any[];
      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
      }));
    }

    const whereConditions = [];
    if (communityId) {
      whereConditions.push(eq(posts.communityId, communityId));
    } else {
      whereConditions.push(isNull(posts.communityId));
    }

    if (category) {
      if (category.includes(",")) {
        const categories = category.split(",").map(c => c.trim());
        whereConditions.push(inArray(posts.category, categories));
      } else {
        whereConditions.push(eq(posts.category, category));
      }
    }

    return await db
      .select()
      .from(posts)
      .where(and(...whereConditions))
      .orderBy(desc(posts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getPost(id: number): Promise<Post | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite.prepare("SELECT * FROM posts WHERE id = ?").get(id) as any;
      if (!row) return undefined;

      return {
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: new Date(Number(row.created_at) * 1000),
      };
    }
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  async getPostsByUser(userId: number): Promise<Post[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM posts WHERE author_id = ? ORDER BY created_at DESC")
        .all(userId);
      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: isNaN(Number(row.created_at)) ? new Date(row.created_at) : new Date(Number(row.created_at) * 1000),
      }));
    }
    return db.select().from(posts).where(eq(posts.authorId, userId)).orderBy(desc(posts.createdAt));
  }

  async updatePostKarma(id: number, karma: number): Promise<Post> {
    const [post] = await db.update(posts).set({ karma }).where(eq(posts.id, id)).returning();
    return post;
  }

  async deletePost(postId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM comment_likes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ?)").run(postId);
      sqlite.prepare("DELETE FROM comments WHERE post_id = ?").run(postId);
      sqlite.prepare("DELETE FROM post_likes WHERE post_id = ?").run(postId);
      sqlite.prepare("DELETE FROM posts WHERE id = ?").run(postId);
      return;
    }
    await db.delete(postLikes).where(eq(postLikes.postId, postId));
    await db.delete(comments).where(eq(comments.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "karma">): Promise<Comment> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(
        "INSERT INTO comments (post_id, content, author_id, karma, created_at) VALUES (?, ?, ?, ?, ?)",
      );
      const result = stmt.run(comment.postId, comment.content, comment.authorId, 0, createdAt);

      return {
        id: result.lastInsertRowid as number,
        postId: comment.postId,
        content: comment.content,
        authorId: comment.authorId,
        karma: 0,
        createdAt: new Date(createdAt * 1000),
      };
    }
    const [newComment] = await db.insert(comments).values(comment).returning();
    return newComment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 100")
        .all(postId);
      return rows.map((comment: any) => ({
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      }));
    }
    return db.select().from(comments).where(eq(comments.postId, postId)).limit(100);
  }

  async updateCommentKarma(id: number, karma: number): Promise<Comment> {
    const [comment] = await db
      .update(comments)
      .set({ karma })
      .where(eq(comments.id, id))
      .returning();
    return comment;
  }

  async getComment(id: number): Promise<Comment | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const comment = sqlite.prepare("SELECT * FROM comments WHERE id = ?").get(id) as any;
      if (!comment) return undefined;
      return {
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      };
    }
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment;
  }

  async deleteComment(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM comment_likes WHERE comment_id = ?").run(id);
      sqlite.prepare("DELETE FROM comments WHERE id = ?").run(id);
      return;
    }
    await db.delete(commentLikes).where(eq(commentLikes.commentId, id));
    await db.delete(comments).where(eq(comments.id, id));
  }

  // Reactions
  async createPostLike(userId: number, postId: number, isLike: boolean): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("INSERT INTO post_likes (user_id, post_id, is_like, created_at) VALUES (?, ?, ?, ?)")
        .run(userId, postId, isLike ? 1 : 0, Math.floor(Date.now() / 1000));
      return;
    }
    await db.insert(postLikes).values({ userId, postId, isLike });
  }

  async removePostReaction(userId: number, postId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?").run(userId, postId);
      return;
    }
    await db.delete(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
  }

  async getUserPostReaction(userId: number, postId: number): Promise<{ isLike: boolean } | null> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const reaction = sqlite
        .prepare("SELECT is_like as isLike FROM post_likes WHERE user_id = ? AND post_id = ?")
        .get(userId, postId) as { isLike: number } | undefined;
      return reaction ? { isLike: !!reaction.isLike } : null;
    }
    const [reaction] = await db.select().from(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
    return reaction ? { isLike: reaction.isLike } : null;
  }

  async getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const likes = sqlite.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 1").get(postId) as { count: number };
      const dislikes = sqlite.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 0").get(postId) as { count: number };
      return { likes: likes.count, dislikes: dislikes.count };
    }
    const likes = await db.select({ count: sql<number>`count(*)` }).from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, true)));
    const dislikes = await db.select({ count: sql<number>`count(*)` }).from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, false)));
    return { likes: likes[0].count, dislikes: dislikes[0].count };
  }

  async getBatchPostReactions(postIds: number[]): Promise<Map<number, { likes: number; dislikes: number }>> {
    const results = new Map<number, { likes: number; dislikes: number }>();
    if (postIds.length === 0) return results;

    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const placeholders = postIds.map(() => "?").join(",");
      const rows = sqlite.prepare(`
        SELECT post_id, is_like, COUNT(*) as count 
        FROM post_likes 
        WHERE post_id IN (${placeholders}) 
        GROUP BY post_id, is_like
      `).all(...postIds);

      postIds.forEach(id => results.set(id, { likes: 0, dislikes: 0 }));
      rows.forEach((row: any) => {
        const stats = results.get(row.post_id) || { likes: 0, dislikes: 0 };
        if (row.is_like === 1) stats.likes = row.count;
        else stats.dislikes = row.count;
        results.set(row.post_id, stats);
      });
      return results;
    }

    const rows = await db.select({ postId: postLikes.postId, isLike: postLikes.isLike, count: sql<number>`count(*)` }).from(postLikes).where(inArray(postLikes.postId, postIds)).groupBy(postLikes.postId, postLikes.isLike);
    postIds.forEach(id => results.set(id, { likes: 0, dislikes: 0 }));
    rows.forEach((row: { postId: number; isLike: boolean; count: number }) => {
      const stats = results.get(row.postId) || { likes: 0, dislikes: 0 };
      if (row.isLike) stats.likes = Number(row.count);
      else stats.dislikes = Number(row.count);
      results.set(row.postId, stats);
    });
    return results;
  }

  async likeComment(userId: number, commentId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)")
        .run(userId, commentId, Math.floor(Date.now() / 1000));
      return;
    }
    await db.insert(commentLikes).values({ userId, commentId });
  }

  async unlikeComment(userId: number, commentId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?").run(userId, commentId);
      return;
    }
    await db.delete(commentLikes).where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));
  }

  async getUserCommentLike(userId: number, commentId: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const like = sqlite.prepare("SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?").get(userId, commentId);
      return !!like;
    }
    const [like] = await db.select().from(commentLikes).where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)));
    return !!like;
  }

  async getCommentLikes(commentId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const result = sqlite.prepare("SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ?").get(commentId) as { count: number };
      return result.count;
    }
    const result = await db.select({ count: sql<number>`count(*)` }).from(commentLikes).where(eq(commentLikes.commentId, commentId));
    return result[0].count;
  }

  async getCommentsByUser(userId: number): Promise<Comment[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM comments WHERE author_id = ? ORDER BY created_at DESC LIMIT 100")
        .all(userId);
      return rows.map((comment: any) => ({
        id: comment.id,
        postId: comment.post_id,
        content: comment.content,
        authorId: comment.author_id,
        karma: comment.karma,
        createdAt: new Date(Number(comment.created_at) * 1000),
      }));
    }
    return db
      .select()
      .from(comments)
      .where(eq(comments.authorId, userId))
      .orderBy(desc(comments.createdAt))
      .limit(100);
  }

  async getLikedPostsByUser(userId: number): Promise<Post[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`
        SELECT p.* 
        FROM posts p 
        INNER JOIN post_likes pl ON pl.post_id = p.id 
        WHERE pl.user_id = ? AND pl.is_like = 1 
        ORDER BY pl.created_at DESC
      `).all(userId) as any[];

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        authorId: row.author_id,
        category: row.category,
        karma: row.karma,
        mediaUrl: row.media_url,
        mediaType: row.media_type,
        communityId: row.community_id || null,
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }

    const result = await db
      .select({ post: posts })
      .from(postLikes)
      .innerJoin(posts, eq(postLikes.postId, posts.id))
      .where(and(eq(postLikes.userId, userId), eq(postLikes.isLike, true)))
      .orderBy(desc(postLikes.createdAt));

    return result.map((r: { post: Post }) => r.post);
  }
}
