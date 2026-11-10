import { Router } from 'express';
import { SPORTS, SPORTS_AVEC_DPLUS, validerBlocs } from '../blocs.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifierAthleteDuCoach } from '../liens.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { estimerBlocs, referencesSansAllure, resoudreReferences } from '../partage/estimation.js';
import * as valider from '../validation.js';
import { lireProfil } from './profil.js';

const router = Router();

export const TYPES_SEANCE = ['endurance', 'fractionne', 'renfo', 'competition', 'repos', 'autre'];

// Colonnes renvoyées pour une séance, avec son retour éventuel regroupé dans un objet.
const SELECT_SEANCE = `
  SELECT s.id, s.athlete_id AS "athleteId", s.date, s.titre, s.sport, s.type,
         s.duree_prevue_min AS "dureePrevueMin", s.dplus_prevu_m AS "dplusPrevuM",
         s.description, s.blocs, s.statut,
         CASE WHEN r.id IS NULL THEN NULL
              ELSE json_build_object(
                'difficulte', r.difficulte,
                'forme', r.forme,
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

const MAX_DPLUS_SEANCE = 20000;

// D+ de la séance : la somme des D+ des blocs (répétitions comprises) si au moins un bloc
// en a un, sinon la valeur saisie directement par le coach. Rien pour renfo / autre.
function lireDplus(body, sport, blocs) {
  if (!SPORTS_AVEC_DPLUS.includes(sport)) return null;
  const somme = estimerBlocs(blocs).dplus;
  if (somme > MAX_DPLUS_SEANCE) {
    throw new HttpError(400, `Le D+ total des blocs (${somme} m) dépasse 20 000 m.`);
  }
  if (somme > 0) return somme;
  return valider.entier(body.dplusPrevuM, 'Le D+ de la séance', {
    min: 0,
    max: MAX_DPLUS_SEANCE,
    optionnel: true,
  });
}

// Contenu d'une séance sans la date (réutilisé pour la bibliothèque de séances types :
// modele = true). Les blocs restent une liste ; on les convertit en texte JSON
// (JSON.stringify) au moment de les écrire dans la colonne JSONB.
export function lireContenuSeance(body = {}, { modele = false } = {}) {
  const sport = valider.choix(body.sport, 'Le sport', SPORTS);
  const blocs = validerBlocs(body.blocs, sport, { modele });
  return {
    titre: valider.texte(body.titre, 'Le titre', { max: 100 }),
    sport,
    type: valider.choix(body.type, 'Le type', TYPES_SEANCE),
    blocs,
    dplusPrevuM: lireDplus(body, sport, blocs),
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

const LIBELLES_REFERENCE = {
  '5k': '@5k',
  '10k': '@10k',
  '21k': '@21k',
  '42k': '@42k',
  sv1: '@SV1',
  sv2: '@SV2',
};

// Les allures de référence encore vides (ex. séance créée depuis un modèle) sont calculées
// avec le profil de l'athlète. Si le profil ne contient pas la valeur, le coach doit la saisir.
export async function completerAllures(blocs, athleteId) {
  if (referencesSansAllure(blocs).length === 0) return blocs;
  const resolus = resoudreReferences(blocs, await lireProfil(athleteId));
  const manquantes = referencesSansAllure(resolus).map((ref) => LIBELLES_REFERENCE[ref]);
  if (manquantes.length > 0) {
    throw new HttpError(
      400,
      `Allure ${manquantes.join(', ')} absente du profil de l’athlète : saisissez-la dans le bloc.`,
    );
  }
  return resolus;
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
  const blocs = await completerAllures(s.blocs, athleteId);

  const { rows } = await pool.query(
    `INSERT INTO seances
       (coach_id, athlete_id, date, titre, sport, type, duree_prevue_min, description, blocs,
        dplus_prevu_m)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
      JSON.stringify(blocs),
      s.dplusPrevuM,
    ],
  );
  res.status(201).json(await trouverSeance(rows[0].id));
});

// PUT /api/seances/:id : le coach modifie une de ses séances
router.put('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const s = lireSeance(req.body);

  // L'athlète de la séance sert à compléter les allures de référence avec son profil.
  // La condition coach_id garantit qu'un coach ne modifie que ses propres séances.
  const existante = await pool.query(
    'SELECT athlete_id FROM seances WHERE id = $1 AND coach_id = $2',
    [id, req.user.id],
  );
  if (!existante.rows[0]) throw new HttpError(404, 'Séance introuvable.');
  const blocs = await completerAllures(s.blocs, existante.rows[0].athlete_id);

  // La condition coach_id = $10 garantit qu'un coach ne modifie que ses propres séances.
  const { rowCount } = await pool.query(
    `UPDATE seances
     SET date = $1, titre = $2, sport = $3, type = $4, duree_prevue_min = $5,
         description = $6, blocs = $7, dplus_prevu_m = $8
     WHERE id = $9 AND coach_id = $10`,
    [
      s.date,
      s.titre,
      s.sport,
      s.type,
      s.dureePrevueMin,
      s.description,
      JSON.stringify(blocs),
      s.dplusPrevuM,
      id,
      req.user.id,
    ],
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
       (coach_id, athlete_id, date, titre, sport, type, duree_prevue_min, description, blocs,
        dplus_prevu_m)
     SELECT coach_id, $1, $2, titre, sport, type, duree_prevue_min, description, blocs,
            dplus_prevu_m
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

// POST /api/seances/:id/retour : l'athlète indique si la séance est faite et donne son retour
// (difficulté de la séance et forme ressentie de 1 à 10, commentaire).
// Un nouvel envoi remplace le retour précédent.
router.post('/:id/retour', requireAuth, requireRole('athlete'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const body = req.body ?? {};
  const statut = valider.choix(body.statut, 'Le statut', ['realisee', 'non_realisee']);
  // Les notes sont obligatoires pour une séance réalisée, facultatives sinon
  const optionnel = statut === 'non_realisee';
  const difficulte = valider.entier(body.difficulte, 'La difficulté', {
    min: 1,
    max: 10,
    optionnel,
  });
  const forme = valider.entier(body.forme, 'La forme', { min: 1, max: 10, optionnel });
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
      `INSERT INTO retours (seance_id, difficulte, forme, commentaire)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (seance_id) DO UPDATE
       SET difficulte = EXCLUDED.difficulte, forme = EXCLUDED.forme,
           commentaire = EXCLUDED.commentaire, date = now()`,
      [id, difficulte, forme, commentaire],
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
