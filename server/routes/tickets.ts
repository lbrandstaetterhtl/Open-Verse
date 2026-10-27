import { Router } from "express";
import { z } from "zod";
import { isAuthenticated, hasPermission, isOwner } from "../middleware/auth";
import { TicketService } from "../services/ticket-service";
import { activityLogger } from "../services/activity-logger";
import { storage } from "../storage";
import { userHasPermission } from "../utils/permissions";
import { validateIdParams, parseId } from "../utils/params";
import { text, httpUrl, dbId, isPlainBody, queryString, queryInt } from "../utils/admin-input";

import { sendInternalError, sendValidationError } from "../utils/http-errors";
const router = Router();

// Ticket and comment ids are numbers; anything else ("undefined", "abc", "-1", > 2^31-1) can't be one.
validateIdParams(router, ["id", "cId"]);

const TICKET_TYPES = ['bug_report', 'feature_request', 'user_complaint', 'content_issue', 'security_concern', 'performance_issue', 'access_request', 'data_issue', 'other'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const STATUSES = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'] as const;
const SORTS = ['newest', 'oldest', 'updated', 'priority'] as const;

const createTicketSchema = z.object({
  title: text(200, 10),
  description: text(10000, 50),
  type: z.enum(TICKET_TYPES),
  priority: z.enum(PRIORITIES),
  // Rendered as a link for staff: http(s) only, never javascript:/data:/vbscript:
  relatedUrl: httpUrl(),
  relatedUserId: z.union([dbId, z.null()]).optional(),
  relatedPostId: z.union([dbId, z.null()]).optional(),
});

const ownerUpdateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.union([dbId, z.null()]).optional(),
  relatedUrl: httpUrl(),
  reason: z.union([text(1000), z.null()]).optional(),
});
const creatorUpdateSchema = z.object({
  status: z.literal("closed"),
  reason: z.union([text(1000), z.null()]).optional(),
});
const commentSchema = z.object({
  content: text(5000, 1),
  isInternal: z.boolean().optional(),
});
const editCommentSchema = z.object({ content: text(5000, 1) });

// Service errors carry a message meant for the user. Database errors would leak the SQL query, so
// they are logged and answered with a generic message.
function sendError(res: any, err: any) {
  // Never send internal error texts (database errors etc.) to the browser
  return sendInternalError(res, err, "Ticket request failed");
}

const notFound = (res: any) => res.status(404).json({ error: "Ticket not found or forbidden" });

// Deleting and restoring tickets is for owners; for everybody who is not staff these routes do not exist (404).
const checkOwner = isOwner;

/** Owner, or an admin whose group has the "tickets" permission: sees and moderates every ticket. */
const isTicketStaff = (user: any) => userHasPermission(user, "tickets");

async function loadTicket(req: any) {
  const user = req.user as any;
  return TicketService.getTicketById(Number(req.params.id), user.role, user.id, await isTicketStaff(user));
}

// GET /api/tickets/stats
router.get("/stats", hasPermission("tickets"), async (req, res) => {
  try {
    const stats = await TicketService.getStats();
    res.json(stats);
  } catch (err: any) {
    sendError(res, err);
  }
});

// GET /api/tickets
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const q = req.query;
    const status = queryString(q.status, 20);
    const priority = queryString(q.priority, 20);
    const type = queryString(q.type, 40);
    const sortBy = queryString(q.sortBy, 20);
    const search = queryString(q.search, 200);
    const assignedTo = q.assignedTo === undefined || q.assignedTo === "" ? undefined : parseId(q.assignedTo);
    const createdBy = q.createdBy === undefined || q.createdBy === "" ? undefined : parseId(q.createdBy);
    const page = queryInt(q.page, 1, 1, 100000);
    const limit = queryInt(q.limit, 20, 1, 100);
    const invalid =
      [status, priority, type, sortBy, search].includes(false) || assignedTo === null || createdBy === null || page === null || limit === null ||
      (status && !(STATUSES as readonly string[]).includes(status)) ||
      (priority && !(PRIORITIES as readonly string[]).includes(priority)) ||
      (type && !(TICKET_TYPES as readonly string[]).includes(type)) ||
      (sortBy && !(SORTS as readonly string[]).includes(sortBy));
    if (invalid) return res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR" });

    const filters = { status, priority, type, assignedTo, createdBy, sortBy, search, page, limit };
    const data = await TicketService.getTickets(await isTicketStaff(user), user.id, filters);
    res.json(data);
  } catch (err: any) {
    sendError(res, err);
  }
});

// GET /api/tickets/:id
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const data = await loadTicket(req);
    if (!data) return notFound(res);
    res.json(data);
  } catch (err: any) {
    sendError(res, err);
  }
});

// POST /api/tickets
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const data = parsed.data;

    const ticket = await TicketService.createTicket(data, user.id);

    activityLogger.logFromRequest(req, {
      action: 'ticket.create',
      category: 'support',
      description: `Neues Ticket erstellt: ${data.title.slice(0, 50)}`,
      targetType: 'Ticket',
      targetId: String(ticket?.ticket.id),
      targetLabel: ticket?.ticket.ticketNumber,
      severity: data.priority === 'critical' ? 'warning' : 'info',
      newValue: { type: data.type, priority: data.priority }
    }).catch(err => console.error('[Monitor] ticket.create failed:', err));

    res.status(201).json(ticket);
  } catch (err: any) {
    sendError(res, err);
  }
});

// PATCH /api/tickets/:id
// Everyone may close a ticket they can see (their own); only the owner changes anything else.
router.patch("/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = Number(req.params.id);

    const existing = await loadTicket(req);
    if (!existing) return notFound(res);
    if (!isPlainBody(req.body)) return res.status(400).json({ error: "Invalid input", code: "VALIDATION_ERROR" });

    // Owner can change everything
    // Admin can only change close condition for own ticket
    let updateData: any;
    if (user.role === 'owner') {
      const parsed = ownerUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      updateData = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
      if (req.body.relatedUrl === undefined) delete updateData.relatedUrl;
      if (updateData.assignedTo) {
        const assignee = await storage.getUser(updateData.assignedTo);
        if (!assignee) return res.status(404).json({ error: "User not found" });
      }
    } else {
      if (req.body.status !== 'closed') return res.status(403).json({ error: "You can only close this ticket" });
      const parsed = creatorUpdateSchema.safeParse(req.body);
      if (!parsed.success) return sendValidationError(res, parsed.error);
      updateData = { status: 'closed', reason: parsed.data.reason };
    }

    await TicketService.updateTicket(ticketId, updateData, user.id);
    const updated = await loadTicket(req);

    activityLogger.logFromRequest(req, {
      action: 'ticket.status_change',
      category: 'support',
      description: `Ticket aktualisiert${updateData.status ? ` - Neuer Status: ${updateData.status}` : ''}`,
      targetType: 'Ticket',
      targetId: String(ticketId),
      targetLabel: existing.ticket.ticketNumber,
      severity: 'info',
      newValue: updateData,
      oldValue: { status: existing.ticket.status, priority: existing.ticket.priority }
    }).catch(err => console.error('[Monitor] ticket.status_change failed:', err));

    res.json(updated);
  } catch (err: any) {
    sendError(res, err);
  }
});

// DELETE /api/tickets/:id
router.delete("/:id", checkOwner, async (req, res) => {
  try {
    const success = await TicketService.deleteTicket(Number(req.params.id));
    if (success) {
      res.status(204).end();
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (err: any) {
    sendError(res, err);
  }
});

// POST /api/tickets/:id/comments
router.post("/:id/comments", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = Number(req.params.id);

    const existing = await loadTicket(req);
    if (!existing) return notFound(res);

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    const { content } = parsed.data;
    const isInternal = parsed.data.isInternal === true;

    if (isInternal && user.role !== 'owner') {
      return res.status(403).json({ error: "Only owners can create internal comments" });
    }

    await TicketService.addComment(ticketId, user.id, content, isInternal);

    // Return updated ticket to reflect new comment
    const updated = await loadTicket(req);

    activityLogger.logFromRequest(req, {
      action: 'ticket.comment',
      category: 'support',
      description: `Neuer Kommentar in Ticket ${ticketId}${isInternal ? ' (Intern)' : ''}`,
      targetType: 'Ticket',
      targetId: String(ticketId),
      severity: 'info',
      metadata: { isInternal }
    }).catch(err => console.error('[Monitor] ticket.comment failed:', err));

    res.status(201).json(updated);
  } catch (err: any) {
    sendError(res, err);
  }
});

/** Ticket visible + comment belongs to it + caller is its author or ticket staff; sends the error otherwise. */
async function authorizeComment(req: any, res: any): Promise<boolean> {
  const user = req.user as any;
  const existing = await loadTicket(req);
  if (!existing) { notFound(res); return false; }
  const access = await TicketService.checkCommentAccess(Number(req.params.id), Number(req.params.cId), user, await isTicketStaff(user));
  if (access === "not_found") { res.status(404).json({ error: "Comment not found" }); return false; }
  if (access === "forbidden") { res.status(403).json({ error: "You can only change your own comments", code: "NOT_COMMENT_AUTHOR" }); return false; }
  return true;
}

// PATCH /api/tickets/:id/comments/:cId
router.patch("/:id/comments/:cId", isAuthenticated, async (req, res) => {
  try {
    const parsed = editCommentSchema.safeParse(req.body);
    if (!parsed.success) return sendValidationError(res, parsed.error);
    if (!(await authorizeComment(req, res))) return;

    const success = await TicketService.editComment(Number(req.params.id), Number(req.params.cId), parsed.data.content);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Comment not found" });
    }
  } catch (err: any) {
    sendError(res, err);
  }
});

// DELETE /api/tickets/:id/comments/:cId
router.delete("/:id/comments/:cId", isAuthenticated, async (req, res) => {
  try {
    if (!(await authorizeComment(req, res))) return;

    const success = await TicketService.deleteComment(Number(req.params.id), Number(req.params.cId));
    if (success) {
      res.status(204).end();
    } else {
      res.status(404).json({ error: "Comment not found" });
    }
  } catch (err: any) {
    sendError(res, err);
  }
});

// POST /api/tickets/:id/restore
router.post("/:id/restore", checkOwner, async (req, res) => {
  try {
    const success = await TicketService.restoreTicket(Number(req.params.id));
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Not found" });
    }
  } catch (err: any) {
    sendError(res, err);
  }
});

// GET /api/tickets/:id/history
router.get("/:id/history", isAuthenticated, async (req, res) => {
  try {
    const existing = await loadTicket(req);
    if (!existing) return notFound(res);

    res.json(existing.history);
  } catch (err: any) {
    sendError(res, err);
  }
});

export default router;
