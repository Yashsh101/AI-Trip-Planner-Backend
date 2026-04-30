import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler<TReq extends Request = Request>(
  handler: (req: TReq, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as TReq, res, next)).catch(next);
  };
}
