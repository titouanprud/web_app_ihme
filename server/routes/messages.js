import { Router } from 'express';
import { pool } from '../db.js';
import { binomeDe } from '../liens.js';
import { requireAuth } from '../middlewares/auth.js';
import * as valider from '../validation.js';

const router = Router();

// Nombre maximum de messages renvoyés (les plus récents)
const LIMITE = 200;

// GET /api/messages?athleteId= : la conversation du binôme coach / athlète.
// (athleteId est obligatoire pour un coach, ignoré pour un athlète.)
// Les messages reçus par l'utilisateur sont marqués comme lus à cette occasion.
router.get('/', requireAuth, async (req, res) => {
  const { coachId, athleteId } = await binomeDe(req.user, req.query.athleteId);

  await pool.query(
    `UPDATE messages SET lu = true
     WHERE coach_id = $1 AND athlete_id = $2 AND auteur_id <> $3 AND NOT lu`,
    [coachId, athleteId, req.user.id],
  );
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT id, auteur_id AS "auteurId", contenu, date_envoi AS "dateEnvoi", lu
       FROM messages
       WHERE coach_id = $1 AND athlete_id = $2
       ORDER BY id DESC
       LIMIT $3
     ) AS derniers
     ORDER BY id`,
    [coachId, athleteId, LIMITE],
  );
  res.json(rows);
});

// POST /api/messages : envoyer un message dans la conversation du binôme
router.post('/', requireAuth, async (req, res) => {
  const { coachId, athleteId } = await binomeDe(req.user, req.body?.athleteId);
  const contenu = valider.texte(req.body?.contenu, 'Le message', { max: 2000 });

  const { rows } = await pool.query(
    `INSERT INTO messages (coach_id, athlete_id, auteur_id, contenu)
     VALUES ($1, $2, $3, $4)
     RETURNING id, auteur_id AS "auteurId", contenu, date_envoi AS "dateEnvoi", lu`,
    [coachId, athleteId, req.user.id, contenu],
  );
  res.status(201).json(rows[0]);
});

export default router;
