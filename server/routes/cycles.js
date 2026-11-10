import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifierAccesAthlete } from '../liens.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';
import { lirePeriode } from './seances.js';

// Cycles d'entraînement (préparation générale, affûtage…) de plusieurs semaines.
// Le coach les crée pour ses athlètes et pour lui-même ; l'athlète les voit sans les modifier.
const router = Router();

export const TYPES_CYCLE = [
  'preparation_generale',
  'specifique',
  'affutage',
  'recuperation',
  'competition',
  'autre',
];

const COLONNES = `id, athlete_id AS "athleteId", nom, type, date_debut AS "dateDebut",
  date_fin AS "dateFin", objectif, couleur`;

// Jour de la semaine d'une date "AAAA-MM-JJ" : 0 = dimanche, 1 = lundi…
const jourDeLaSemaine = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function lireCycle(body = {}) {
  const dateDebut = valider.dateISO(body.dateDebut, 'La date de début');
  const dateFin = valider.dateISO(body.dateFin, 'La date de fin');
  if (jourDeLaSemaine(dateDebut) !== 1) {
    throw new HttpError(400, 'Un cycle commence un lundi.');
  }
  if (jourDeLaSemaine(dateFin) !== 0) throw new HttpError(400, 'Un cycle se termine un dimanche.');
  if (dateFin < dateDebut) throw new HttpError(400, 'La fin du cycle doit suivre son début.');
  // Un an au plus : ses totaux restent dans la limite de période de /api/seances/totaux
  if ((Date.parse(dateFin) - Date.parse(dateDebut)) / 86400000 > 364) {
    throw new HttpError(400, 'Un cycle ne peut pas dépasser 52 semaines.');
  }
  const couleur = valider.texte(body.couleur ?? '#2563eb', 'La couleur', { max: 7 });
  if (!/^#[0-9a-fA-F]{6}$/.test(couleur)) {
    throw new HttpError(400, 'La couleur doit être au format #RRVVBB.');
  }
  return {
    nom: valider.texte(body.nom, 'Le nom', { max: 100 }),
    type: valider.choix(body.type, 'Le type', TYPES_CYCLE),
    dateDebut,
    dateFin,
    objectif: valider.texte(body.objectif, 'L’objectif', { max: 2000, optionnel: true }),
    couleur,
  };
}

// Enregistre un cycle (création si id est null, sinon modification) après avoir vérifié qu'il
// ne chevauche aucun autre cycle de l'athlète. Le verrou pg_advisory_xact_lock(athleteId)
// empêche deux enregistrements simultanés pour le même athlète de passer la vérification
// en même temps ; il est libéré automatiquement à la fin de la transaction.
async function enregistrerCycle({ id = null, coachId, athleteId, c }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [athleteId]);
    // Deux périodes se chevauchent si chacune commence avant la fin de l'autre
    const conflit = await client.query(
      `SELECT nom FROM cycles
       WHERE athlete_id = $1 AND id <> $2 AND date_debut <= $4 AND date_fin >= $3`,
      [athleteId, id ?? 0, c.dateDebut, c.dateFin],
    );
    if (conflit.rows[0]) {
      throw new HttpError(409, `Ce cycle chevauche le cycle « ${conflit.rows[0].nom} ».`);
    }
    const valeurs = [c.nom, c.type, c.dateDebut, c.dateFin, c.objectif, c.couleur];
    const { rows } = id
      ? await client.query(
          `UPDATE cycles SET nom = $1, type = $2, date_debut = $3, date_fin = $4,
                             objectif = $5, couleur = $6
           WHERE id = $7 RETURNING ${COLONNES}`,
          [...valeurs, id],
        )
      : await client.query(
          `INSERT INTO cycles (nom, type, date_debut, date_fin, objectif, couleur,
                               coach_id, athlete_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLONNES}`,
          [...valeurs, coachId, athleteId],
        );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// GET /api/cycles?athleteId=&from=&to= : cycles qui touchent la période
// (le coach : ceux qu'il a créés pour cet athlète ou pour lui-même ; l'athlète : les siens)
router.get('/', requireAuth, async (req, res) => {
  const { from, to } = lirePeriode(req.query);
  let filtre = 'athlete_id = $1';
  let params = [req.user.id];
  if (req.user.role === 'coach') {
    const athleteId = valider.identifiant(req.query.athleteId, "L'athlète (athleteId)");
    await verifierAccesAthlete(req.user.id, athleteId);
    filtre = 'athlete_id = $1 AND coach_id = $2';
    params = [athleteId, req.user.id];
  }
  const n = params.length;
  const { rows } = await pool.query(
    `SELECT ${COLONNES} FROM cycles
     WHERE ${filtre} AND date_debut <= $${n + 2} AND date_fin >= $${n + 1}
     ORDER BY date_debut`,
    [...params, from, to],
  );
  res.json(rows);
});

// POST /api/cycles : le coach crée un cycle pour un de ses athlètes ou pour lui-même
router.post('/', requireAuth, requireRole('coach'), async (req, res) => {
  const athleteId = valider.identifiant(req.body?.athleteId, "L'athlète");
  const c = lireCycle(req.body);
  await verifierAccesAthlete(req.user.id, athleteId);
  res.status(201).json(await enregistrerCycle({ coachId: req.user.id, athleteId, c }));
});

// PUT /api/cycles/:id : le coach modifie un de ses cycles (l'athlète ne change pas)
router.put('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const c = lireCycle(req.body);
  const { rows } = await pool.query(
    'SELECT athlete_id FROM cycles WHERE id = $1 AND coach_id = $2',
    [id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Cycle introuvable.');
  res.json(await enregistrerCycle({ id, athleteId: rows[0].athlete_id, c }));
});

// DELETE /api/cycles/:id : le coach supprime un de ses cycles (les séances restent)
router.delete('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const { rowCount } = await pool.query('DELETE FROM cycles WHERE id = $1 AND coach_id = $2', [
    id,
    req.user.id,
  ]);
  if (rowCount === 0) throw new HttpError(404, 'Cycle introuvable.');
  res.status(204).end();
});

export default router;
