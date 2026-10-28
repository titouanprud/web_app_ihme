import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';
import { lireContenuSeance } from './seances.js';

// Bibliothèque de séances types : des modèles sans date, propres à chaque coach,
// qu'il réutilise pour créer rapidement des séances.
const router = Router();
router.use(requireAuth, requireRole('coach'));

const COLONNES = `id, titre, sport, type, duree_prevue_min AS "dureePrevueMin", description, blocs`;

// GET /api/seances-types : les modèles du coach connecté
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLONNES} FROM seances_types WHERE coach_id = $1 ORDER BY titre, id`,
    [req.user.id],
  );
  res.json(rows);
});

// POST /api/seances-types : enregistrer un modèle
router.post('/', async (req, res) => {
  const s = lireContenuSeance(req.body);
  const { rows } = await pool.query(
    `INSERT INTO seances_types (coach_id, titre, sport, type, duree_prevue_min, description, blocs)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLONNES}`,
    [req.user.id, s.titre, s.sport, s.type, s.dureePrevueMin, s.description, s.blocs],
  );
  res.status(201).json(rows[0]);
});

// PUT /api/seances-types/:id : modifier un de ses modèles
router.put('/:id', async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const s = lireContenuSeance(req.body);
  const { rows } = await pool.query(
    `UPDATE seances_types
     SET titre = $1, sport = $2, type = $3, duree_prevue_min = $4, description = $5, blocs = $6
     WHERE id = $7 AND coach_id = $8
     RETURNING ${COLONNES}`,
    [s.titre, s.sport, s.type, s.dureePrevueMin, s.description, s.blocs, id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Modèle introuvable.');
  res.json(rows[0]);
});

// DELETE /api/seances-types/:id : supprimer un de ses modèles
router.delete('/:id', async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const { rowCount } = await pool.query(
    'DELETE FROM seances_types WHERE id = $1 AND coach_id = $2',
    [id, req.user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'Modèle introuvable.');
  res.status(204).end();
});

export default router;
