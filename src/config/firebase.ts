import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { AppError } from '../types';
import { logger } from '../middleware/logger';
import { config } from './index';

let db: Firestore | null = null;

export function getFirestore(): Firestore {
  if (db) return db;

  try {
    const privateKey = config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.FIREBASE_PROJECT_ID,
            clientEmail: config.FIREBASE_CLIENT_EMAIL,
            privateKey,
          }),
        });

    db = app.firestore();
    return db;
  } catch (err) {
    logger.error({ event: 'firebase_init_failed', message: String(err) });
    throw new AppError('Firestore is unavailable', 503, 'FIRESTORE_ERROR', err);
  }
}

export function isFirebaseConfigured(): boolean {
  return Boolean(config.FIREBASE_PROJECT_ID && config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY);
}
