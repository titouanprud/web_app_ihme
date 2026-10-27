import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import invitationsRoutes from './routes/invitations.js';
import athletesRoutes from './routes/athletes.js';
import seancesRoutes from './routes/seances.js';
import { apiNotFound, errorHandler } from './middlewares/errors.js';

// Construit l'application Express (séparée de index.js pour pouvoir la tester).
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Middleware : transforme le corps JSON des requêtes en objet req.body
  app.use(express.json({ limit: '100kb' }));

  // --- API ---
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/invitations', invitationsRoutes);
  app.use('/api/athletes', athletesRoutes);
  app.use('/api/seances', seancesRoutes);
  app.use('/api', apiNotFound);

  // --- React compilé (après `npm run build`) ---
  const distDir = path.resolve(import.meta.dirname, '../dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    // Toute autre adresse (ex. /coach/athletes/3) renvoie index.html :
    // c'est React Router qui affiche ensuite la bonne page.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
