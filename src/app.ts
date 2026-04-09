import express from 'express';
import { registerRoutes } from './routes';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  registerRoutes(app);

  return app;
}
