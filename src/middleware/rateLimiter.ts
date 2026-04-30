import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { AppError } from '../types';

export const itineraryRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.ITINERARY_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many itinerary requests. Try again in a minute.', 429, 'RATE_LIMITED'));
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.API_RATE_LIMIT_PER_MINUTE,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError('Too many API requests. Try again in a minute.', 429, 'RATE_LIMITED'));
  },
});
