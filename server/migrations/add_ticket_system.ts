import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function addTicketSystem() {
  console.log('🎫 Erstelle Ticket-System Tabellen...');

  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number   TEXT NOT NULL UNIQUE,
        created_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type            TEXT NOT NULL DEFAULT 'other',
        priority        TEXT NOT NULL DEFAULT 'medium',
        status          TEXT NOT NULL DEFAULT 'open',
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        related_post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
        related_url     TEXT,
        attachments     TEXT DEFAULT '[]',
        tags            TEXT DEFAULT '[]',
        created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        resolved_at     INTEGER,
        closed_at       INTEGER,
        deleted_at      INTEGER,
        CHECK (type IN ('bug_report','feature_request','user_complaint','content_issue','security_concern','performance_issue','access_request','data_issue','other')),
        CHECK (status IN ('open','in_progress','on_hold','resolved','closed')),
        CHECK (priority IN ('low','medium','high','critical'))
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content     TEXT NOT NULL,
        is_internal INTEGER NOT NULL DEFAULT 0,
        is_system   INTEGER NOT NULL DEFAULT 0,
        change_type TEXT,
        change_from TEXT,
        change_to   TEXT,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        deleted_at  INTEGER
      );
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS ticket_status_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        changed_by  INTEGER NOT NULL REFERENCES users(id),
        from_status TEXT,
        to_status   TEXT NOT NULL,
        reason      TEXT,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `);

    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(type)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets(deleted_at) WHERE deleted_at IS NULL`);

    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_ticket_comments_author_id ON ticket_comments(author_id)`);

    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_status_history(ticket_id)`);

    console.log('✅ Ticket-System Tabellen erstellt');
  } catch (err: any) {
    console.error('❌ Fehler beim Erstellen der Ticket-Tabellen:', err.message);
  }
}
