import type {
  Theme,
  InsertTheme} from "@shared/schema";
import {
  themes,
} from "@shared/schema";
import { db, getSqlite } from "../db";
import { eq, desc } from "drizzle-orm";

export class ThemeStorage {
  async createTheme(userId: number, theme: InsertTheme): Promise<Theme> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const createdAt = Math.floor(Date.now() / 1000);
      const stmt = sqlite.prepare(
        "INSERT INTO themes (user_id, name, colors, created_at) VALUES (?, ?, ?, ?)",
      );
      const result = stmt.run(userId, theme.name, theme.colors, createdAt);

      return {
        id: result.lastInsertRowid as number,
        userId,
        name: theme.name,
        colors: theme.colors,
        createdAt: new Date(createdAt * 1000),
      };
    }

    const [newTheme] = await db
      .insert(themes)
      .values({ ...theme, userId })
      .returning();
    return newTheme;
  }

  async getThemes(userId: number): Promise<Theme[]> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const rows = sqlite
        .prepare("SELECT * FROM themes WHERE user_id = ? ORDER BY created_at DESC")
        .all(userId);
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        colors: row.colors,
        createdAt: new Date(Number(row.created_at) * 1000),
      }));
    }

    return db
      .select()
      .from(themes)
      .where(eq(themes.userId, userId))
      .orderBy(desc(themes.createdAt));
  }

  async deleteTheme(id: number): Promise<void> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      sqlite.prepare("DELETE FROM themes WHERE id = ?").run(id);
      return;
    }
    await db.delete(themes).where(eq(themes.id, id));
  }

  async updateTheme(id: number, theme: Partial<InsertTheme>): Promise<Theme> {
    const sqlite = getSqlite();
    if (process.env.USE_SQLITE === "true" && sqlite) {
      const sets: string[] = [];
      const params: any[] = [];
      if (theme.name) {
        sets.push("name = ?");
        params.push(theme.name);
      }
      if (theme.colors) {
        sets.push("colors = ?");
        params.push(theme.colors);
      }

      params.push(id); 

      sqlite.prepare(`UPDATE themes SET ${sets.join(", ")} WHERE id = ?`).run(...params);

      const updated = sqlite.prepare("SELECT * FROM themes WHERE id = ?").get(id) as any;
      return {
        id: updated.id,
        userId: updated.user_id,
        name: updated.name,
        colors: updated.colors,
        createdAt: new Date(Number(updated.created_at) * 1000),
      };
    }

    const [updated] = await db.update(themes).set(theme).where(eq(themes.id, id)).returning();
    return updated;
  }
}
