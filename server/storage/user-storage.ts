import type {
  User,
  InsertUser} from "@shared/schema";
import {
  users,
  verificationTokens,
  followers,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";

export class UserStorage {
  async getUser(id: number): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
      if (!user) return undefined;

      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE username = ?").get(username);
      if (!user) return undefined;

      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const user = sqlite.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return undefined;

      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUsersByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return [];
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const placeholders = ids.map(() => "?").join(",");
      const rows = sqlite
        .prepare(`SELECT * FROM users WHERE id IN (${placeholders})`)
        .all(...ids) as any[];
      return rows.map((user: any) => ({
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      }));
    }
    return db.select().from(users).where(inArray(users.id, ids));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const sqlite = getSqlite();
    const now = Math.floor(Date.now() / 1000);

    if (process.env.USE_SQLITE === "true" && sqlite) {
      const result = sqlite
        .prepare(
          "INSERT INTO users (username, password, email, created_at, karma, is_admin, verified, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          insertUser.username,
          insertUser.password,
          insertUser.email,
          now,
          0,
          0,
          0,
          0,
        );

      const user = sqlite
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(result.lastInsertRowid);
      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }

    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserProfile(
    id: number,
    profile: Partial<{
      username: string;
      email: string;
      profilePictureUrl: string;
      isAdmin: boolean;
      role: string;
      emailVerified: boolean;
      verified: boolean;
      karma: number;
      bio: string;
      displayName: string;
      avatarUrl: string;
      coverUrl: string;
      location: string;
      website: string;
      isPrivate: boolean;
    }>,
  ): Promise<User> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const fields = [];
      const values = [];

      for (const [key, value] of Object.entries(profile)) {
        // Map camelCase to snake_case for SQLite
        let dbKey = key;
        if (key === "profilePictureUrl") dbKey = "profile_picture_url";
        if (key === "emailVerified") dbKey = "email_verified";
        if (key === "isAdmin") dbKey = "is_admin";
        if (key === "displayName") dbKey = "display_name";
        if (key === "avatarUrl") dbKey = "avatar_url";
        if (key === "coverUrl") dbKey = "cover_url";
        if (key === "isPrivate") dbKey = "is_private";

        fields.push(`${dbKey} = ?`);
        if (typeof value === "boolean") {
          values.push(value ? 1 : 0);
        } else {
          values.push(value);
        }
      }

      values.push(id);
      sqlite
        .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
        .run(...values);

      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }

    // Map potential booleans in profile to integers for Postgres compatibility
    const mappedProfile: any = { ...profile };
    for (const key of Object.keys(mappedProfile)) {
      if (typeof mappedProfile[key] === 'boolean') {
        mappedProfile[key] = mappedProfile[key] ? 1 : 0;
      }
    }

    const [updatedUser] = await db
      .update(users)
      .set(mappedProfile)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async updateUserPassword(id: number, password: string): Promise<User> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE users SET password = ? WHERE id = ?").run(password, id);
      const user = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return {
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      };
    }

    const [user] = await db
      .update(users)
      .set({ password })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserKarma(id: number, karma: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare("UPDATE users SET karma = karma + ? WHERE id = ?")
        .run(karma, id);
      return;
    }

    await db
      .update(users)
      .set({ karma: sql`karma + ${karma}` })
      .where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
      sqlite
        .prepare(
          "UPDATE global_stats SET value = value + 1 WHERE key = 'deleted_users_count'",
        )
        .run();
      return;
    }
    await db.delete(users).where(eq(users.id, id));
  }

  // Verification Tokens
  async createVerificationToken(token: {
    token: string;
    userId: number;
    expiresAt: Date;
  }): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare(
          "INSERT INTO verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
        )
        .run(token.token, token.userId, token.expiresAt.toISOString());
      return;
    }
    await db.insert(verificationTokens).values(token);
  }

  async getVerificationToken(token: string): Promise<
    | {
        token: string;
        userId: number;
        expiresAt: Date;
      }
    | undefined
  > {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const data = sqlite
        .prepare("SELECT * FROM verification_tokens WHERE token = ?")
        .get(token);
      if (!data) return undefined;
      return {
        token: data.token,
        userId: data.user_id,
        expiresAt: new Date(data.expires_at),
      };
    }
    const [data] = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.token, token));
    return data;
  }

  async deleteVerificationToken(token: string): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM verification_tokens WHERE token = ?").run(token);
      return;
    }
    await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
  }

  async verifyUserEmail(userId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
      return;
    }
    await db
      .update(users)
      .set({ emailVerified: 1 })
      .where(eq(users.id, userId));
  }

  // Social
  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const follow = sqlite
        .prepare(
          "SELECT 1 FROM followers WHERE follower_id = ? AND following_id = ?",
        )
        .get(followerId, followingId);
      return !!follow;
    }
    const [follow] = await db
      .select()
      .from(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followingId, followingId),
        ),
      );
    return !!follow;
  }

  async followUser(followerId: number, followingId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO followers (follower_id, following_id) VALUES (?, ?)",
        )
        .run(followerId, followingId);
      return;
    }
    await db
      .insert(followers)
      .values({ followerId, followingId })
      .onConflictDoNothing();
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite
        .prepare(
          "DELETE FROM followers WHERE follower_id = ? AND following_id = ?",
        )
        .run(followerId, followingId);
      return;
    }
    await db
      .delete(followers)
      .where(
        and(
          eq(followers.followerId, followerId),
          eq(followers.followingId, followingId),
        ),
      );
  }

  async getFollowers(userId: number): Promise<User[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          "SELECT u.* FROM users u INNER JOIN followers f ON f.follower_id = u.id WHERE f.following_id = ?",
        )
        .all(userId) as any[];
      return rows.map((user: any) => ({
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      }));
    }
    const result = await db
      .select({ user: users })
      .from(followers)
      .innerJoin(users, eq(followers.followerId, users.id))
      .where(eq(followers.followingId, userId));
    return result.map((r: { user: User }) => r.user);
  }

  async getFollowing(userId: number): Promise<User[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare(
          "SELECT u.* FROM users u INNER JOIN followers f ON f.following_id = u.id WHERE f.follower_id = ?",
        )
        .all(userId) as any[];
      return rows.map((user: any) => ({
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      }));
    }
    const result = await db
      .select({ user: users })
      .from(followers)
      .innerJoin(users, eq(followers.followingId, users.id))
      .where(eq(followers.followerId, userId));
    return result.map((r) => r.user);
  }

  async getFollowerCount(userId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite
        .prepare("SELECT COUNT(*) as count FROM followers WHERE following_id = ?")
        .get(userId) as { count: number };
      return row.count;
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followingId, userId));
    return Number(result[0].count);
  }

  async getFollowingCount(userId: number): Promise<number> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const row = sqlite
        .prepare("SELECT COUNT(*) as count FROM followers WHERE follower_id = ?")
        .get(userId) as { count: number };
      return row.count;
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(followers)
      .where(eq(followers.followerId, userId));
    return Number(result[0].count);
  }

  async getMutualFollowers(userId1: number, userId2: number): Promise<User[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      // Find following of userId1 that are followers of userId2
      const rows = sqlite.prepare(`
        SELECT u.* 
        FROM users u 
        INNER JOIN followers f1 ON f1.following_id = u.id 
        INNER JOIN followers f2 ON f2.follower_id = u.id 
        WHERE f1.follower_id = ? AND f2.following_id = ?
      `).all(userId1, userId2) as any[];

      return rows.map((user: any) => ({
        ...user,
        emailVerified: Boolean(user.email_verified),
        isAdmin: Boolean(user.is_admin),
        verified: Boolean(user.verified),
        isPrivate: Boolean(user.is_private),
        createdAt: new Date(Number(user.created_at) * 1000),
      }));
    }

    // Postgres path
    const result = await db
      .select({ user: users })
      .from(followers)
      .innerJoin(users, eq(followers.followingId, users.id))
      .where(
        and(
          eq(followers.followerId, userId1),
          sql`${users.id} IN (SELECT follower_id FROM followers WHERE following_id = ${userId2})`,
        ),
      );

    return result.map((r: { user: User }) => r.user);
  }
}
