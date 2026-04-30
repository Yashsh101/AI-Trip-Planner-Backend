import cors from 'cors';
import { config } from '../config';

export const corsMiddleware = cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
});
