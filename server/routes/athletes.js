import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';

const router = Router();

// GET /api/athletes : le coach connecté voit uniquement ses propres athlètes
router.get('/', requireAuth, requireRole('coach'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.prenom, u.nom, u.email, ca.date_ajout AS "dateAjout"
     FROM coach_athletes ca
     JOIN users u ON u.id = ca.athlete_id
     WHERE ca.coach_id = $1
     ORDER BY u.nom, u.prenom`,
    [req.user.id],
  );
  res.json(rows);
});

export default router;
