import { Router } from 'express';
import { healthRouter } from './health.route';
import { itineraryRouter } from './itinerary.route';
import { tripsRouter } from './trips.route';

export const routes = Router();

routes.use('/health', healthRouter);
routes.use('/itinerary', itineraryRouter);
routes.use('/trips', tripsRouter);
