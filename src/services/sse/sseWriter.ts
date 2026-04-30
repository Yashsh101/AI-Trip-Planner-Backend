import type { Response } from 'express';

export function initSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function writeMeta(res: Response, data: unknown): void {
  writeEvent(res, 'meta', data);
}

export function writeToken(res: Response, token: { text: string }): void {
  writeEvent(res, 'token', token);
}

export function writeDone(res: Response, data: unknown): void {
  writeEvent(res, 'done', data);
}

export function writeError(res: Response, data: { code: string; message: string; details?: unknown }): void {
  writeEvent(res, 'error', data);
}
