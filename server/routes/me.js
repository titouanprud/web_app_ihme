import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// GET /api/me : infos de l'utilisateur connecté (et son coach pour un athlète)
router.get('/', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.prenom, u.nom, u.role,
            CASE WHEN c.id IS NULL THEN NULL
                 ELSE json_build_object('id', c.id, 'prenom', c.prenom, 'nom', c.nom)
            END AS coach
     FROM users u
     LEFT JOIN coach_athletes ca ON ca.athlete_id = u.id
     LEFT JOIN users c ON c.id = ca.coach_id
     WHERE u.id = $1`,
    [req.user.id],
  );
  if (!rows[0]) throw new HttpError(401, 'Ce compte n’existe plus, veuillez vous reconnecter.');
  res.json(rows[0]);
});

export default router;
