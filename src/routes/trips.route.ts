import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../types';
import { getFirestore } from '../config/firebase';
import { validateParams } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';

export const tripsRouter = Router();
const TripIdParamsSchema = z.object({ id: z.string().uuid() });

tripsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      const snapshot = await getFirestore().collection('trips').orderBy('generatedAt', 'desc').limit(25).get();
      const trips = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json({ trips });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('Unable to load trips', 503, 'FIRESTORE_ERROR', err);
    }
  }),
);

tripsRouter.get(
  '/:id',
  validateParams(TripIdParamsSchema),
  asyncHandler(async (req, res) => {
    try {
      const doc = await getFirestore().collection('trips').doc(req.params.id).get();
      if (!doc.exists) {
        throw new AppError('Trip not found', 404, 'NOT_FOUND');
      }

      res.json({ trip: { id: doc.id, ...doc.data() } });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('Unable to load trip', 503, 'FIRESTORE_ERROR', err);
    }
  }),
);
