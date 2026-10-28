import { Router } from 'express';
import { SPORTS, validerBlocs } from '../blocs.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifierAthleteDuCoach } from '../liens.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';

const router = Router();

export const TYPES_SEANCE = ['endurance', 'fractionne', 'renfo', 'competition', 'repos', 'autre'];

// Colonnes renvoyées pour une séance, avec son retour éventuel regroupé dans un objet.
const SELECT_SEANCE = `
  SELECT s.id, s.athlete_id AS "athleteId", s.date, s.titre, s.sport, s.type,
         s.duree_prevue_min AS "dureePrevueMin", s.description, s.blocs, s.statut,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE json_build_object(
                'ressenti', r.ressenti,
                'dureeReelleMin', r.duree_reelle_min,
                'commentaire', r.commentaire,
                'date', r.date)
         END AS retour
  FROM seances s
  LEFT JOIN retours r ON r.seance_id = s.id`;

async function trouverSeance(id) {
  const { rows } = await pool.query(`${SELECT_SEANCE} WHERE s.id = $1`, [id]);
  return rows[0];
}

// Lit et valide les champs d'une séance envoyés par le coach (date comprise).
function lireSeance(body = {}) {
  return { date: valider.dateISO(body.date, 'La date'), ...lireContenuSeance(body) };
}

// Contenu d'une séance sans la date (réutilisé pour la bibliothèque de séances types).
// Les blocs sont convertis en texte JSON pour la colonne JSONB.
export function lireContenuSeance(body = {}) {
  const sport = valider.choix(body.sport, 'Le sport', SPORTS);
  return {
    titre: valider.texte(body.titre, 'Le titre', { max: 100 }),
    sport,
    type: valider.choix(body.type, 'Le type', TYPES_SEANCE),
    blocs: JSON.stringify(validerBlocs(body.blocs, sport)),
    dureePrevueMin: valider.entier(body.dureePrevueMin, 'La durée prévue', {
      min: 0,
      max: 1440,
      optionnel: true,
    }),
    description: valider.texte(body.description, 'La description', {
      max: 2000,
      optionnel: true,
    }),
  };
}

// GET /api/seances?athleteId=&from=&to= : séances sur une période
// - un coach doit préciser athleteId, qui doit être un de ses athlètes ;
// - un athlète voit toujours ses propres séances (athleteId est ignoré).
router.get('/', requireAuth, async (req, res) => {
  const from = valider.dateISO(req.query.from, 'La date de début (from)');
  const to = valider.dateISO(req.query.to, 'La date de fin (to)');
  if (from > to) throw new HttpError(400, 'La date de début doit précéder la date de fin.');

  let filtre;
  let params;
  if (req.user.role === 'coach') {
    const athleteId = valider.identifiant(req.query.athleteId, "L'athlète (athleteId)");
    await verifierAthleteDuCoach(req.user.id, athleteId);
    filtre = 's.athlete_id = $1 AND s.coach_id = $2';
    params = [athleteId, req.user.id];
  } else {
    filtre = 's.athlete_id = $1';
    params = [req.user.id];
  }

  const { rows } = await pool.query(
    `${SELECT_SEANCE}
     WHERE ${filtre} AND s.date BETWEEN $${params.length + 1} AND $${params.length + 2}
     ORDER BY s.date, s.id`,
    [...params, from, to],
  );
  res.json(rows);
});

// POST /api/seances : le coach crée une séance pour un de ses athlètes
router.post('/', requireAuth, requireRole('coach'), async (req, res) => {
  const athleteId = valider.identifiant(req.body?.athleteId, "L'athlète");
  const s = lireSeance(req.body);
  await verifierAthleteDuCoach(req.user.id, athleteId);

  const { rows } = await pool.query(
    `INSERT INTO seances
       (coach_id, athlete_id, date, titre, sport, type, duree_prevue_min, description, blocs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      req.user.id,
      athleteId,
      s.date,
      s.titre,
      s.sport,
      s.type,
      s.dureePrevueMin,
      s.description,
      s.blocs,
    ],
  );
  res.status(201).json(await trouverSeance(rows[0].id));
});

// PUT /api/seances/:id : le coach modifie une de ses séances
router.put('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const s = lireSeance(req.body);

  // La condition coach_id = $9 garantit qu'un coach ne modifie que ses propres séances.
  const { rowCount } = await pool.query(
    `UPDATE seances
     SET date = $1, titre = $2, sport = $3, type = $4, duree_prevue_min = $5,
         description = $6, blocs = $7
     WHERE id = $8 AND coach_id = $9`,
    [s.date, s.titre, s.sport, s.type, s.dureePrevueMin, s.description, s.blocs, id, req.user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'Séance introuvable.');
  res.json(await trouverSeance(id));
});

// POST /api/seances/:id/dupliquer : le coach copie une de ses séances à une autre date,
// pour le même athlète ou un autre de ses athlètes. La copie repart au statut "prevue".
router.post('/:id/dupliquer', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const date = valider.dateISO(req.body?.date, 'La date');
  const athleteId = valider.identifiant(req.body?.athleteId, "L'athlète");
  await verifierAthleteDuCoach(req.user.id, athleteId);

  // INSERT … SELECT : copie directe en base ; "WHERE coach_id" protège les séances des autres coachs
  const { rows } = await pool.query(
    `INSERT INTO seances
       (coach_id, athlete_id, date, titre, sport, type, duree_prevue_min, description, blocs)
     SELECT coach_id, $1, $2, titre, sport, type, duree_prevue_min, description, blocs
     FROM seances WHERE id = $3 AND coach_id = $4
     RETURNING id`,
    [athleteId, date, id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Séance introuvable.');
  res.status(201).json(await trouverSeance(rows[0].id));
});

// DELETE /api/seances/:id : le coach supprime une de ses séances (et son retour)
router.delete('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const { rowCount } = await pool.query('DELETE FROM seances WHERE id = $1 AND coach_id = $2', [
    id,
    req.user.id,
  ]);
  if (rowCount === 0) throw new HttpError(404, 'Séance introuvable.');
  res.status(204).end();
});

// POST /api/seances/:id/retour : l'athlète indique si la séance est faite et donne son retour.
// Un nouvel envoi remplace le retour précédent.
router.post('/:id/retour', requireAuth, requireRole('athlete'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const body = req.body ?? {};
  const statut = valider.choix(body.statut, 'Le statut', ['realisee', 'non_realisee']);
  const ressenti = valider.entier(body.ressenti, 'Le ressenti', {
    min: 1,
    max: 10,
    optionnel: statut === 'non_realisee',
  });
  const dureeReelleMin = valider.entier(body.dureeReelleMin, 'La durée réelle', {
    min: 0,
    max: 1440,
    optionnel: true,
  });
  const commentaire = valider.texte(body.commentaire, 'Le commentaire', {
    max: 2000,
    optionnel: true,
  });

  // Transaction : le statut et le retour sont enregistrés ensemble, ou pas du tout.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'UPDATE seances SET statut = $1 WHERE id = $2 AND athlete_id = $3',
      [statut, id, req.user.id],
    );
    if (rowCount === 0) throw new HttpError(404, 'Séance introuvable.');
    await client.query(
      `INSERT INTO retours (seance_id, ressenti, duree_reelle_min, commentaire)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (seance_id) DO UPDATE
       SET ressenti = EXCLUDED.ressenti, duree_reelle_min = EXCLUDED.duree_reelle_min,
           commentaire = EXCLUDED.commentaire, date = now()`,
      [id, ressenti, dureeReelleMin, commentaire],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await trouverSeance(id));
});

export default router;
