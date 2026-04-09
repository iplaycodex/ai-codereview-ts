// MUST load dotenv before any other imports that read process.env
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'conf/.env') });

import { createApp } from './app';
import { config } from './config';
import { checkConfig } from './config/checker';
import { ReviewService } from './service/review-service';
import logger from './logger';

async function main() {
  // Initialize database
  await ReviewService.getInstance().initDb();

  // Check configuration
  await checkConfig();

  // Create and start Express server
  const app = createApp();
  const port = config.serverPort;

  app.listen(port, '0.0.0.0', () => {
    logger.info(`[ai-codereview-ts] Server running on http://0.0.0.0:${port}`);
  });
}

main().catch((e) => {
  console.error('Failed to start server:', e);
  process.exit(1);
});
