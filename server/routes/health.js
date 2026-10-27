import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// GET /api/health : utilisé par le serveur du cours pour vérifier que l'app répond.
// Ne renvoie aucune information confidentielle (ni erreur détaillée, ni version).
router.get('/', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
