// server/middleware/error-handler.ts
// Fängt ALLE unbehandelten Fehler ab und loggt sie

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Bereits gesendete Response nicht nochmal senden
  if (res.headersSent) {
    logger.error('error', 'Error after headers sent', err, {
      path:      req.path,
      requestId: req.requestId,
    });
    return;
  }

  // Client errors raised by middleware (body parser, multer/busboy): answer 4xx, not 500
  const clientError = classifyClientError(err);
  if (clientError) {
    logger.warn('http', `Rejected request: ${clientError.code}`, { path: req.path, method: req.method, requestId: req.requestId });
    res.status(clientError.status).json({ error: clientError.error, code: clientError.code });
    return;
  }

  // Kritische Fehler anders behandeln
  const isCritical =
    err.message?.includes('SQLITE') ||
    err.message?.includes('out of memory') ||
    err.message?.includes('ENOENT') ||
    err.name === 'SystemError';

  if (isCritical) {
    logger.critical('error', `Critical system error: ${err.message}`, err, {
      path:      req.path,
      method:    req.method,
      requestId: req.requestId,
      userId:    (req as any).user?.id,
    });
  } else {
    logger.error('error', `Unhandled route error: ${err.message}`, err, {
      path:      req.path,
      method:    req.method,
      requestId: req.requestId,
      userId:    (req as any).user?.id,
    });
  }

  // Never the message or the stack trace, whatever NODE_ENV says: they are in the server log (requestId).
  const status = Number(err?.status || err?.statusCode);
  res.status(status >= 500 && status < 600 ? status : 500).json({
    error:     'Internal server error',
    requestId: req.requestId,
  });
}

function classifyClientError(err: any): { status: number; error: string; code: string } | null {
  if (err?.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'File too large', code: 'FILE_TOO_LARGE' };
    return { status: 400, error: 'Invalid upload', code: 'INVALID_UPLOAD' };
  }
  const msg = String(err?.message ?? '');
  if (/^(Unexpected end of form|Malformed part header|Multipart: Boundary not found|Unexpected end of multipart data)/.test(msg)) {
    return { status: 400, error: 'Invalid upload', code: 'INVALID_UPLOAD' };
  }
  if (err?.type === 'entity.parse.failed') return { status: 400, error: 'Invalid JSON', code: 'INVALID_JSON' };
  if (err?.type === 'entity.too.large') return { status: 413, error: 'Request too large', code: 'PAYLOAD_TOO_LARGE' };
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500) {
    return { status: err.status, error: 'Bad request', code: 'BAD_REQUEST' };
  }
  return null;
}
