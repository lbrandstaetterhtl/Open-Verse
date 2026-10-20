import type {
  Post,
  Comment} from "@shared/schema";
import {
  postLikes,
  comments,
  posts,
  commentLikes,
  savedPosts,
  reports,
  users,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, asc, desc, sql, inArray, isNull, or } from "drizzle-orm";

// Namespaces for pg_advisory_xact_lock(namespace, userId): serialise one user's check-then-write sequences
// (post cooldown, reaction toggles, duplicate reports) so parallel requests cannot race past the check.
const LOCK_POST_CREATE = 7301;
const LOCK_POST_REACTION = 7302;
const LOCK_COMMENT_LIKE = 7303;
const LOCK_REPORT = 7304;

const lockFor = (tx: any, namespace: number, userId: number) =>
  tx.execute(sql`select pg_advisory_xact_lock(${namespace}::int, ${userId}::int)`);

const rowToPost = (row: any): Post => ({
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
});

export type ReportTarget = { postId?: number | null; commentId?: number | null; discussionId?: number | null };

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

  /**
   * Creates the post unless the author posted less than `cooldownSeconds` ago. Check and insert run under a
   * per-user lock, so parallel requests cannot all pass the check (CONTENT-11).
   */
  async createPostWithCooldown(
    post: Omit<Post, "id" | "createdAt" | "karma">,
    cooldownSeconds: number,
  ): Promise<{ post: Post } | { remainingSeconds: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      // better-sqlite3 is synchronous: nothing can run between this check and the insert below.
      const last = sqlite.prepare("SELECT created_at FROM posts WHERE author_id = ? ORDER BY created_at DESC LIMIT 1").get(post.authorId) as any;
      if (last && cooldownSeconds > 0) {
        const created = isNaN(Number(last.created_at)) ? new Date(last.created_at).getTime() : Number(last.created_at) * 1000;
        const age = (Date.now() - created) / 1000;
        if (age < cooldownSeconds) return { remainingSeconds: Math.ceil(cooldownSeconds - age) };
      }
      return { post: await this.createPost(post) };
    }
    return db.transaction(async (tx: any) => {
      await lockFor(tx, LOCK_POST_CREATE, post.authorId);
      if (cooldownSeconds > 0) {
        const [row] = await tx
          .select({ age: sql<number>`extract(epoch from (now() - max(${posts.createdAt})))`.mapWith(Number) })
          .from(posts)
          .where(eq(posts.authorId, post.authorId));
        if (row && row.age !== null && !Number.isNaN(row.age) && row.age < cooldownSeconds) {
          return { remainingSeconds: Math.max(1, Math.ceil(cooldownSeconds - row.age)) };
        }
      }
      const [created] = await tx.insert(posts).values(post).returning();
      return { post: created };
    });
  }

  async getPostsByIds(ids: number[]): Promise<Post[]> {
    if (ids.length === 0) return [];
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare(`SELECT * FROM posts WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as any[];
      return rows.map(rowToPost);
    }
    return db.select().from(posts).where(inArray(posts.id, ids));
  }

  async getPosts(options: { category?: string; communityId?: number; limit?: number; offset?: number } = {}): Promise<Post[]> {
    const { category, communityId, limit = 50, offset = 0 } = options;
    // Callers check the community's visibility before asking for its posts (routes/posts.ts).
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
      sqlite.prepare("DELETE FROM saved_posts WHERE post_id = ?").run(postId);
      sqlite.prepare("DELETE FROM posts WHERE id = ?").run(postId);
      return;
    }
    // Everything that hangs off the post goes with it (CONTENT-21a): likes, bookmarks, its comments with their
    // likes, and still-open reports about the post or its comments (handled reports stay as moderation history).
    await db.transaction(async (tx: any) => {
      const commentIds = (await tx.select({ id: comments.id }).from(comments).where(eq(comments.postId, postId))).map((r: any) => r.id);
      if (commentIds.length > 0) {
        await tx.delete(commentLikes).where(inArray(commentLikes.commentId, commentIds));
        await tx.delete(reports).where(and(eq(reports.status, "pending"), inArray(reports.commentId, commentIds)));
      }
      await tx.delete(reports).where(and(eq(reports.status, "pending"), or(eq(reports.postId, postId), eq(reports.discussionId, postId))));
      await tx.delete(postLikes).where(eq(postLikes.postId, postId));
      await tx.delete(savedPosts).where(eq(savedPosts.postId, postId));
      await tx.delete(comments).where(eq(comments.postId, postId));
      await tx.delete(posts).where(eq(posts.id, postId));
    });
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

  /** Comments of a post, oldest first. Paged with limit/offset (default: the first 1000). */
  async getComments(postId: number, options: { limit?: number; offset?: number } = {}): Promise<Comment[]> {
    const { limit = 1000, offset = 0 } = options;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?")
        .all(postId, limit, offset);
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
      .where(eq(comments.postId, postId))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .limit(limit)
      .offset(offset);
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
    await db.transaction(async (tx: any) => {
      await tx.delete(commentLikes).where(eq(commentLikes.commentId, id));
      await tx.delete(reports).where(and(eq(reports.status, "pending"), eq(reports.commentId, id)));
      await tx.delete(comments).where(eq(comments.id, id));
    });
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
    await db.insert(postLikes).values({ userId, postId, isLike: isLike ? 1 : 0 });
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
    // is_like is an integer column in Postgres; the client compares with true/false.
    return reaction ? { isLike: !!reaction.isLike } : null;
  }

  async getPostReactions(postId: number): Promise<{ likes: number; dislikes: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const likes = sqlite.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 1").get(postId) as { count: number };
      const dislikes = sqlite.prepare("SELECT COUNT(*) as count FROM post_likes WHERE post_id = ? AND is_like = 0").get(postId) as { count: number };
      return { likes: likes.count, dislikes: dislikes.count };
    }
    const likes = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, 1)));
    const dislikes = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.isLike, 0)));
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

    const rows = await db.select({ postId: postLikes.postId, isLike: postLikes.isLike, count: sql<number>`count(*)`.mapWith(Number) }).from(postLikes).where(inArray(postLikes.postId, postIds)).groupBy(postLikes.postId, postLikes.isLike);
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
    const result = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(commentLikes).where(eq(commentLikes.commentId, commentId));
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

  /**
   * Sets, switches or removes the user's reaction to a post and applies the matching karma change to the post
   * author, all in one transaction under a per-user lock: parallel clicks cannot create duplicate rows or
   * inflate karma (CONTENT-22). Returns what happened and the karma delta that was applied.
   */
  async togglePostReaction(
    userId: number,
    postId: number,
    isLike: boolean,
    authorId: number | null,
  ): Promise<{ action: "added" | "switched" | "removed"; karmaDelta: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite.prepare("SELECT is_like FROM post_likes WHERE user_id = ? AND post_id = ?").all(userId, postId) as any[];
      let delta = rows.reduce((d, r) => d + (r.is_like ? -1 : 1), 0);
      sqlite.prepare("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?").run(userId, postId);
      const same = rows.length > 0 && !!rows[0].is_like === isLike;
      if (!same) {
        sqlite.prepare("INSERT INTO post_likes (user_id, post_id, is_like, created_at) VALUES (?, ?, ?, ?)")
          .run(userId, postId, isLike ? 1 : 0, Math.floor(Date.now() / 1000));
        delta += isLike ? 1 : -1;
      }
      if (authorId && delta) sqlite.prepare("UPDATE users SET karma = karma + ? WHERE id = ?").run(delta, authorId);
      return { action: same ? "removed" : rows.length ? "switched" : "added", karmaDelta: authorId ? delta : 0 };
    }
    return db.transaction(async (tx: any) => {
      await lockFor(tx, LOCK_POST_REACTION, userId);
      const removed = await tx
        .delete(postLikes)
        .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)))
        .returning({ isLike: postLikes.isLike });
      // Undo the karma of every removed row (older data may hold duplicates).
      let delta = removed.reduce((d: number, r: any) => d + (r.isLike ? -1 : 1), 0);
      const same = removed.length > 0 && !!removed[0].isLike === isLike;
      if (!same) {
        await tx.insert(postLikes).values({ userId, postId, isLike: isLike ? 1 : 0 }).onConflictDoNothing();
        delta += isLike ? 1 : -1;
      }
      if (authorId && delta) await tx.update(users).set({ karma: sql`karma + ${delta}` }).where(eq(users.id, authorId));
      return { action: same ? "removed" : removed.length ? "switched" : "added", karmaDelta: authorId ? delta : 0 };
    });
  }

  /** Likes or unlikes a comment and applies ±1 karma to its author, atomically (see togglePostReaction). */
  async toggleCommentLike(userId: number, commentId: number, authorId: number | null): Promise<{ liked: boolean; karmaDelta: number }> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const removed = sqlite.prepare("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?").run(userId, commentId).changes;
      let delta = -removed;
      if (!removed) {
        sqlite.prepare("INSERT INTO comment_likes (user_id, comment_id, created_at) VALUES (?, ?, ?)").run(userId, commentId, Math.floor(Date.now() / 1000));
        delta = 1;
      }
      if (authorId && delta) sqlite.prepare("UPDATE users SET karma = karma + ? WHERE id = ?").run(delta, authorId);
      return { liked: !removed, karmaDelta: authorId ? delta : 0 };
    }
    return db.transaction(async (tx: any) => {
      await lockFor(tx, LOCK_COMMENT_LIKE, userId);
      const removed = await tx
        .delete(commentLikes)
        .where(and(eq(commentLikes.userId, userId), eq(commentLikes.commentId, commentId)))
        .returning({ id: commentLikes.id });
      let delta = -removed.length;
      if (removed.length === 0) {
        await tx.insert(commentLikes).values({ userId, commentId }).onConflictDoNothing();
        delta = 1;
      }
      if (authorId && delta) await tx.update(users).set({ karma: sql`karma + ${delta}` }).where(eq(users.id, authorId));
      return { liked: removed.length === 0, karmaDelta: authorId ? delta : 0 };
    });
  }

  /** Like counts for several comments at once. */
  async getBatchCommentLikes(commentIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (commentIds.length === 0) return counts;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(`SELECT comment_id, COUNT(*) AS n FROM comment_likes WHERE comment_id IN (${commentIds.map(() => "?").join(",")}) GROUP BY comment_id`)
        .all(...commentIds) as any[];
      rows.forEach((r) => counts.set(r.comment_id, Number(r.n)));
      return counts;
    }
    const rows = await db
      .select({ commentId: commentLikes.commentId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(commentLikes)
      .where(inArray(commentLikes.commentId, commentIds))
      .groupBy(commentLikes.commentId);
    rows.forEach((r: any) => counts.set(r.commentId, Number(r.n)));
    return counts;
  }

  /** Which of the given comments the user has liked. */
  async getUserCommentLikeIds(userId: number, commentIds: number[]): Promise<Set<number>> {
    if (commentIds.length === 0) return new Set();
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(`SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${commentIds.map(() => "?").join(",")})`)
        .all(userId, ...commentIds) as any[];
      return new Set(rows.map((r) => r.comment_id));
    }
    const rows = await db
      .select({ commentId: commentLikes.commentId })
      .from(commentLikes)
      .where(and(eq(commentLikes.userId, userId), inArray(commentLikes.commentId, commentIds)));
    return new Set(rows.map((r: any) => r.commentId));
  }

  /**
   * Creates a report unless the reporter already has a pending report on the same target (UI-14). Check and
   * insert run under a per-reporter lock.
   */
  async createReportOnce(
    report: { reason: string; reporterId: number; ipAddress: string | null } & ReportTarget,
  ): Promise<{ report: any } | { duplicate: true }> {
    const target = { postId: report.postId ?? null, commentId: report.commentId ?? null, discussionId: report.discussionId ?? null };
    const sameTarget = and(
      eq(reports.reporterId, report.reporterId),
      eq(reports.status, "pending"),
      target.postId ? eq(reports.postId, target.postId) : isNull(reports.postId),
      target.commentId ? eq(reports.commentId, target.commentId) : isNull(reports.commentId),
      target.discussionId ? eq(reports.discussionId, target.discussionId) : isNull(reports.discussionId),
    );
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const existing = sqlite
        .prepare("SELECT id FROM reports WHERE reporter_id = ? AND status = 'pending' AND IFNULL(post_id,0) = ? AND IFNULL(comment_id,0) = ? AND IFNULL(discussion_id,0) = ?")
        .get(report.reporterId, target.postId ?? 0, target.commentId ?? 0, target.discussionId ?? 0);
      if (existing) return { duplicate: true };
      const { storage } = await import("../storage");
      return { report: await storage.createReport({ ...report, ...target } as any) };
    }
    return db.transaction(async (tx: any) => {
      await lockFor(tx, LOCK_REPORT, report.reporterId);
      const [existing] = await tx.select({ id: reports.id }).from(reports).where(sameTarget).limit(1);
      if (existing) return { duplicate: true as const };
      const [created] = await tx
        .insert(reports)
        .values({ reason: report.reason, reporterId: report.reporterId, ipAddress: report.ipAddress, ...target })
        .returning();
      return { report: created };
    });
  }

  // --- Bookmarks ("Merken") ---

  async savePost(userId: number, postId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("INSERT OR IGNORE INTO saved_posts (user_id, post_id) VALUES (?, ?)").run(userId, postId);
      return;
    }
    await db.insert(savedPosts).values({ userId, postId }).onConflictDoNothing();
  }

  async unsavePost(userId: number, postId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?").run(userId, postId);
      return;
    }
    await db.delete(savedPosts).where(and(eq(savedPosts.userId, userId), eq(savedPosts.postId, postId)));
  }

  /** Which of the given posts the user has saved. */
  async getSavedPostIds(userId: number, postIds: number[]): Promise<Set<number>> {
    if (postIds.length === 0) return new Set();
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(`SELECT post_id FROM saved_posts WHERE user_id = ? AND post_id IN (${postIds.map(() => "?").join(",")})`)
        .all(userId, ...postIds) as { post_id: number }[];
      return new Set(rows.map((r) => r.post_id));
    }
    const rows = await db
      .select({ postId: savedPosts.postId })
      .from(savedPosts)
      .where(and(eq(savedPosts.userId, userId), inArray(savedPosts.postId, postIds)));
    return new Set(rows.map((r: { postId: number }) => r.postId));
  }

  /** Saved posts of a user, newest bookmark first. */
  async getSavedPostsByUser(userId: number): Promise<Post[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const ids = sqlite
        .prepare("SELECT post_id FROM saved_posts WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId) as { post_id: number }[];
      const found = await Promise.all(ids.map((r) => this.getPost(r.post_id)));
      return found.filter((p): p is Post => !!p);
    }
    const result = await db
      .select({ post: posts })
      .from(savedPosts)
      .innerJoin(posts, eq(savedPosts.postId, posts.id))
      .where(eq(savedPosts.userId, userId))
      .orderBy(desc(savedPosts.createdAt));
    return result.map((r: { post: Post }) => r.post);
  }

  /** Number of comments per post, for the feed cards. */
  async getBatchCommentCounts(postIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (postIds.length === 0) return counts;
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(`SELECT post_id, COUNT(*) AS n FROM comments WHERE post_id IN (${postIds.map(() => "?").join(",")}) GROUP BY post_id`)
        .all(...postIds) as { post_id: number; n: number }[];
      rows.forEach((r) => counts.set(r.post_id, Number(r.n)));
      return counts;
    }
    const rows = await db
      .select({ postId: comments.postId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(comments)
      .where(inArray(comments.postId, postIds))
      .groupBy(comments.postId);
    rows.forEach((r: { postId: number; n: number }) => counts.set(r.postId, Number(r.n)));
    return counts;
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
      .where(and(eq(postLikes.userId, userId), eq(postLikes.isLike, 1)))
      .orderBy(desc(postLikes.createdAt));

    return result.map((r: { post: Post }) => r.post);
  }
}
