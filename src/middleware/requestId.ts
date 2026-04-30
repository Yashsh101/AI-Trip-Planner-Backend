import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id')?.trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}

export function getRequestId(req: unknown): string | undefined {
  const maybeRequest = req as Partial<RequestWithId> | undefined;
  return maybeRequest?.requestId;
}
