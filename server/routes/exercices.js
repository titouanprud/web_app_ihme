import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';

// Base d'exercices de renforcement proposés dans l'éditeur de séance :
// une base commune (coach_id NULL, remplie par la migration) et les exercices ajoutés
// par chaque coach. Une séance garde le NOM de l'exercice (copie) : supprimer un exercice
// de la base ne change pas les séances déjà prévues.
const router = Router();

export const CATEGORIES_EXERCICE = ['jambes', 'haut_du_corps', 'gainage', 'pliometrie', 'mobilite'];

const COLONNES = `id, nom, categorie, coach_id IS NOT NULL AS "personnel"`;

// GET /api/exercices : base commune + exercices du coach
// (pour un athlète : ceux de son coach, utiles quand il propose une modification)
router.get('/', requireAuth, async (req, res) => {
  let coachId = req.user.id;
  if (req.user.role === 'athlete') {
    const { rows } = await pool.query(
      `SELECT coach_id FROM coach_athletes WHERE athlete_id = $1 AND statut = 'acceptee'`,
      [req.user.id],
    );
    coachId = rows[0]?.coach_id ?? null;
  }
  const { rows } = await pool.query(
    `SELECT ${COLONNES} FROM exercices
     WHERE coach_id IS NULL OR coach_id = $1
     ORDER BY categorie, lower(nom)`,
    [coachId],
  );
  res.json(rows);
});

// POST /api/exercices : le coach ajoute un exercice à sa base. Corps : { nom, categorie }
router.post('/', requireAuth, requireRole('coach'), async (req, res) => {
  const nom = valider.texte(req.body?.nom, 'Le nom de l’exercice', { max: 100 });
  const categorie = valider.choix(
    req.body?.categorie ?? 'haut_du_corps',
    'La catégorie',
    CATEGORIES_EXERCICE,
  );
  // Déjà dans la base commune ou dans la sienne (sans tenir compte des majuscules) : refusé
  const existe = await pool.query(
    `SELECT 1 FROM exercices
     WHERE lower(nom) = lower($1) AND (coach_id IS NULL OR coach_id = $2)`,
    [nom, req.user.id],
  );
  if (existe.rowCount > 0) throw new HttpError(409, 'Cet exercice existe déjà.');

  const { rows } = await pool.query(
    `INSERT INTO exercices (coach_id, nom, categorie) VALUES ($1, $2, $3) RETURNING ${COLONNES}`,
    [req.user.id, nom, categorie],
  );
  res.status(201).json(rows[0]);
});

// DELETE /api/exercices/:id : le coach retire un de SES exercices (pas la base commune)
router.delete('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const { rowCount } = await pool.query('DELETE FROM exercices WHERE id = $1 AND coach_id = $2', [
    id,
    req.user.id,
  ]);
  if (rowCount === 0) throw new HttpError(404, 'Exercice introuvable.');
  res.status(204).end();
});

export default router;
