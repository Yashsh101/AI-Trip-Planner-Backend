import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../types';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new AppError('Request validation failed', 400, 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(new AppError('Route parameter validation failed', 400, 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }

    req.params = result.data as Request['params'];
    next();
  };
}
