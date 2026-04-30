import dotenv from "dotenv";
dotenv.config();

console.log("ENV CHECK:", {
  GEMINI: process.env.GEMINI_API_KEY,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
});
import { createApp } from './app';
import { config } from './config';
import { logger } from './middleware/logger';
import { cacheService } from './services/cache.service';
import { ragService } from './services/rag.service';

async function bootstrap(): Promise<void> {
  await Promise.all([cacheService.connect(), ragService.init()]);

  const app = createApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ event: 'server_started', port: config.PORT, env: config.NODE_ENV });
  });

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ event: 'server_shutdown_started', signal });
    server.close(async (err) => {
      if (err) {
        logger.error({ event: 'server_shutdown_failed', message: err.message });
        process.exit(1);
      }

      await cacheService.disconnect();
      logger.info({ event: 'server_shutdown_complete' });
      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

bootstrap().catch((err) => {
  logger.fatal({ event: 'server_boot_failed', message: String(err) });
  process.exit(1);
});
