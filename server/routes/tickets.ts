import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";
import { TicketService } from "../services/ticket-service";
import { activityLogger } from "../services/activity-logger";

const router = Router();

// Middleware: ensure user is Admin or Owner
const checkAdminOrOwner = (req: any, res: any, next: any) => {
  const user = req.user as any;
  if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
    return res.status(403).send("Forbidden");
  }
  next();
};

const checkOwner = (req: any, res: any, next: any) => {
  const user = req.user as any;
  if (!user || user.role !== 'owner') {
    return res.status(403).send("Forbidden");
  }
  next();
};

// GET /api/tickets/stats
router.get("/stats", isAuthenticated, checkOwner, async (req, res) => {
  try {
    const stats = await TicketService.getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const filters = {
      status: req.query.status as string,
      priority: req.query.priority as string,
      type: req.query.type as string,
      assignedTo: req.query.assignedTo ? parseInt(req.query.assignedTo as string) : undefined,
      createdBy: req.query.createdBy ? parseInt(req.query.createdBy as string) : undefined,
      sortBy: req.query.sortBy as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    };

    const data = await TicketService.getTickets(user.role, user.id, filters);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const data = await TicketService.getTicketById(parseInt(req.params.id), user.role, user.id);
    
    if (!data) return res.status(404).send("Ticket not found or forbidden");
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const { title, description, type, priority } = req.body;

    if (!title || !description || !type || !priority) {
      return res.status(400).send("Missing required fields");
    }

    if (title.length < 10 || title.length > 200) {
      return res.status(400).send("Title must be between 10 and 200 characters");
    }

    if (description.length < 50) {
      return res.status(400).send("Description must be at least 50 characters");
    }

    const validTypes = ['bug_report','feature_request','user_complaint','content_issue','security_concern','performance_issue','access_request','data_issue','other'];
    if (!validTypes.includes(type)) {
      return res.status(400).send("Invalid ticket type");
    }

    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).send("Invalid priority");
    }

    const ticket = await TicketService.createTicket(req.body, user.id);
    
    activityLogger.logFromRequest(req, {
      action: 'ticket.create',
      category: 'support',
      description: `Neues Ticket erstellt: ${title.slice(0, 50)}`,
      targetType: 'Ticket',
      targetId: String(ticket.id),
      severity: priority === 'critical' ? 'high' : 'info',
      newValue: { type, priority }
    }).catch(err => console.error('[Monitor] ticket.create failed:', err));
    
    res.status(201).json(ticket);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id
router.patch("/:id", isAuthenticated, checkAdminOrOwner, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = parseInt(req.params.id);
    
    const existing = await TicketService.getTicketById(ticketId, user.role, user.id);
    if (!existing) return res.status(404).send("Not found");

    // Owner can change everything
    // Admin can only change close condition for own ticket
    const updateData: any = {};
    if (user.role === 'owner') {
      if (req.body.status !== undefined) {
        const validStatuses = ['open', 'in_progress', 'on_hold', 'resolved', 'closed'];
        if (!validStatuses.includes(req.body.status)) return res.status(400).send("Invalid status");
        updateData.status = req.body.status;
      }
      if (req.body.priority !== undefined) {
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(req.body.priority)) return res.status(400).send("Invalid priority");
        updateData.priority = req.body.priority;
      }
      if (req.body.assignedTo !== undefined) {
        updateData.assignedTo = req.body.assignedTo;
      }
      updateData.reason = req.body.reason;
    } else {
      if (req.body.status === 'closed') {
        updateData.status = 'closed';
        updateData.reason = req.body.reason;
      } else {
        return res.status(403).send("Admins can only close their tickets");
      }
    }

    await TicketService.updateTicket(ticketId, updateData, user.id);
    const updated = await TicketService.getTicketById(ticketId, user.role, user.id);
    
    activityLogger.logFromRequest(req, {
      action: 'ticket.status_change',
      category: 'support',
      description: `Ticket aktualisiert${updateData.status ? ` - Neuer Status: ${updateData.status}` : ''}`,
      targetType: 'Ticket',
      targetId: String(ticketId),
      severity: 'info',
      newValue: updateData,
      oldValue: { status: existing.ticket.status, priority: existing.ticket.priority }
    }).catch(err => console.error('[Monitor] ticket.status_change failed:', err));
    
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tickets/:id
router.delete("/:id", isAuthenticated, checkOwner, async (req, res) => {
  try {
    const success = await TicketService.deleteTicket(parseInt(req.params.id));
    if (success) {
      res.status(204).end();
    } else {
      res.status(404).send("Not found");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:id/comments
router.post("/:id/comments", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = parseInt(req.params.id);
    
    const existing = await TicketService.getTicketById(ticketId, user.role, user.id);
    if (!existing) return res.status(404).send("Not found");

    const content = req.body.content;
    const isInternal = req.body.isInternal === true;

    if (!content || !content.trim()) {
      return res.status(400).send("Content required");
    }

    if (isInternal && user.role !== 'owner') {
      return res.status(403).send("Only owners can create internal comments");
    }

    await TicketService.addComment(ticketId, user.id, content, isInternal);
    
    // Return updated ticket to reflect new comment
    const updated = await TicketService.getTicketById(ticketId, user.role, user.id);
    
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
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tickets/:id/comments/:cId
router.patch("/:id/comments/:cId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = parseInt(req.params.id);
    const commentId = parseInt(req.params.cId);
    
    // Auth check on ticket
    const existing = await TicketService.getTicketById(ticketId, user.role, user.id);
    if (!existing) return res.status(404).send("Not found");

    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).send("Content required");

    const success = await TicketService.editComment(commentId, user.id, user.role, content);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(403).send("Forbidden or not found");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tickets/:id/comments/:cId
router.delete("/:id/comments/:cId", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = parseInt(req.params.id);
    const commentId = parseInt(req.params.cId);
    
    const existing = await TicketService.getTicketById(ticketId, user.role, user.id);
    if (!existing) return res.status(404).send("Not found");

    const success = await TicketService.deleteComment(commentId, user.id, user.role);
    if (success) {
      res.status(204).end();
    } else {
      res.status(403).send("Forbidden or not found");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets/:id/restore
router.post("/:id/restore", isAuthenticated, checkOwner, async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    const success = await TicketService.restoreTicket(ticketId);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).send("Not found");
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tickets/:id/history
router.get("/:id/history", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const ticketId = parseInt(req.params.id);
    
    const existing = await TicketService.getTicketById(ticketId, user.role, user.id);
    if (!existing) return res.status(404).send("Not found");

    const history = await TicketService.getHistory(ticketId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
