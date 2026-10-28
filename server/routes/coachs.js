import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

// GET /api/coachs : liste des coachs inscrits, pour qu'un athlète choisisse le sien.
// Seuls le prénom et le nom sont renvoyés (pas l'email).
router.get('/', requireAuth, requireRole('athlete'), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, prenom, nom FROM users WHERE role = 'coach' ORDER BY nom, prenom`,
  );
  res.json(rows);
});

export default router;
