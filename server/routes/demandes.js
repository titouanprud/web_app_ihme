import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';

const router = Router();

// POST /api/demandes : l'athlète demande à rejoindre un coach.
// Possible s'il n'a ni coach ni demande en attente (une demande refusée est remplacée).
router.post('/', requireAuth, requireRole('athlete'), async (req, res) => {
  const coachId = valider.identifiant(req.body?.coachId, 'Le coach');
  const { rows } = await pool.query(
    `SELECT id, prenom, nom FROM users WHERE id = $1 AND role = 'coach'`,
    [coachId],
  );
  const coach = rows[0];
  if (!coach) throw new HttpError(404, 'Coach introuvable.');

  // ON CONFLICT : l'athlète a déjà une ligne. On la remplace seulement si elle est "refusee".
  const { rowCount } = await pool.query(
    `INSERT INTO coach_athletes (coach_id, athlete_id, statut) VALUES ($1, $2, 'en_attente')
     ON CONFLICT (athlete_id) DO UPDATE
     SET coach_id = EXCLUDED.coach_id, statut = 'en_attente', date_ajout = now()
     WHERE coach_athletes.statut = 'refusee'`,
    [coachId, req.user.id],
  );
  if (rowCount === 0) {
    throw new HttpError(409, 'Vous avez déjà un coach ou une demande en attente.');
  }
  res.status(201).json({ statut: 'en_attente', coach });
});

// DELETE /api/demandes : l'athlète annule sa demande en attente
router.delete('/', requireAuth, requireRole('athlete'), async (req, res) => {
  const { rowCount } = await pool.query(
    `DELETE FROM coach_athletes WHERE athlete_id = $1 AND statut = 'en_attente'`,
    [req.user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'Aucune demande en attente.');
  res.status(204).end();
});

// GET /api/demandes : le coach voit les demandes en attente qui lui sont adressées
router.get('/', requireAuth, requireRole('coach'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id AS "athleteId", u.prenom, u.nom, ca.date_ajout AS "dateDemande"
     FROM coach_athletes ca
     JOIN users u ON u.id = ca.athlete_id
     WHERE ca.coach_id = $1 AND ca.statut = 'en_attente'
     ORDER BY ca.date_ajout`,
    [req.user.id],
  );
  res.json(rows);
});

// Accepter ou refuser : seul le coach à qui la demande est adressée peut répondre.
function repondre(statut) {
  return async (req, res) => {
    const athleteId = valider.identifiant(req.params.athleteId, "L'athlète");
    const { rowCount } = await pool.query(
      `UPDATE coach_athletes SET statut = $1, date_ajout = now()
       WHERE athlete_id = $2 AND coach_id = $3 AND statut = 'en_attente'`,
      [statut, athleteId, req.user.id],
    );
    if (rowCount === 0) throw new HttpError(404, 'Demande introuvable.');
    res.json({ statut });
  };
}

// POST /api/demandes/:athleteId/accepter et /refuser
router.post('/:athleteId/accepter', requireAuth, requireRole('coach'), repondre('acceptee'));
router.post('/:athleteId/refuser', requireAuth, requireRole('coach'), repondre('refusee'));

export default router;
