import { Router } from 'express';
import { SPORTS, SPORTS_AVEC_DPLUS, validerBlocs } from '../blocs.js';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifierAccesAthlete } from '../liens.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import {
  estimerBlocs,
  estimerSeance,
  referencesSansAllure,
  resoudreReferences,
} from '../partage/estimation.js';
import * as valider from '../validation.js';
import { lireProfil } from './profil.js';

const router = Router();

export const TYPES_SEANCE = ['endurance', 'fractionne', 'renfo', 'competition', 'repos', 'autre'];

// Colonnes renvoyées pour une séance, avec son retour éventuel regroupé dans un objet.
const SELECT_SEANCE = `
  SELECT s.id, s.athlete_id AS "athleteId", s.date, s.titre, s.sport, s.type,
         s.duree_prevue_min AS "dureePrevueMin", s.dplus_prevu_m AS "dplusPrevuM",
         s.duree_estimee_sec AS "dureeEstimeeSec", s.distance_estimee_m AS "distanceEstimeeM",
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

export async function trouverSeance(id) {
  const { rows } = await pool.query(`${SELECT_SEANCE} WHERE s.id = $1`, [id]);
  return rows[0];
}

// Lit et valide les champs d'une séance envoyés par le coach (date comprise).
export function lireSeance(body = {}) {
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

// Écriture d'une séance déjà validée (s = résultat de lireSeance, allures complétées).
// La durée et la distance estimées sont calculées ici, à chaque enregistrement.
// "db" vaut le pool, ou un client quand l'écriture fait partie d'une transaction.
function valeursSeance(s) {
  const { dureeSec, distanceM } = estimerSeance(s.blocs, s.dureePrevueMin);
  return [
    s.date,
    s.titre,
    s.sport,
    s.type,
    s.dureePrevueMin,
    s.description,
    JSON.stringify(s.blocs),
    s.dplusPrevuM,
    dureeSec,
    distanceM,
  ];
}

export async function insererSeance(coachId, athleteId, s, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO seances
       (date, titre, sport, type, duree_prevue_min, description, blocs, dplus_prevu_m,
        duree_estimee_sec, distance_estimee_m, coach_id, athlete_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [...valeursSeance(s), coachId, athleteId],
  );
  return rows[0].id;
}

export async function modifierSeance(id, s, db = pool) {
  await db.query(
    `UPDATE seances
     SET date = $1, titre = $2, sport = $3, type = $4, duree_prevue_min = $5,
         description = $6, blocs = $7, dplus_prevu_m = $8,
         duree_estimee_sec = $9, distance_estimee_m = $10
     WHERE id = $11`,
    [...valeursSeance(s), id],
  );
}

// Période demandée (from, to) : au plus 400 jours, assez pour la vue Année.
export function lirePeriode(query) {
  const from = valider.dateISO(query.from, 'La date de début (from)');
  const to = valider.dateISO(query.to, 'La date de fin (to)');
  if (from > to) throw new HttpError(400, 'La date de début doit précéder la date de fin.');
  const jours = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (jours > 400) throw new HttpError(400, 'La période ne doit pas dépasser 400 jours.');
  return { from, to };
}

// Séances que l'utilisateur peut lire, sous forme de condition SQL et de ses paramètres :
// - un coach doit préciser athleteId : un de ses athlètes, ou lui-même (son entraînement) ;
// - un athlète voit toujours ses propres séances (athleteId est ignoré).
async function filtreSeancesVisibles(req) {
  if (req.user.role === 'coach') {
    const athleteId = valider.identifiant(req.query.athleteId, "L'athlète (athleteId)");
    await verifierAccesAthlete(req.user.id, athleteId);
    return { filtre: 's.athlete_id = $1 AND s.coach_id = $2', params: [athleteId, req.user.id] };
  }
  return { filtre: 's.athlete_id = $1', params: [req.user.id] };
}

// GET /api/seances?athleteId=&from=&to= : séances sur une période
router.get('/', requireAuth, async (req, res) => {
  const { from, to } = lirePeriode(req.query);
  const { filtre, params } = await filtreSeancesVisibles(req);
  const { rows } = await pool.query(
    `${SELECT_SEANCE}
     WHERE ${filtre} AND s.date BETWEEN $${params.length + 1} AND $${params.length + 2}
     ORDER BY s.date, s.id`,
    [...params, from, to],
  );
  res.json(rows);
});

// Unité de regroupement pour date_trunc (valeur fixe, jamais un texte reçu du client)
const GROUPES = { semaine: 'week', mois: 'month' };

// Somme d'une colonne pour un sport ; COALESCE remplace "aucune séance" (NULL) par 0.
// Le sport vient de la liste ci-dessous, écrite dans le code (pas de donnée du client).
const somme = (colonne, sport) =>
  `COALESCE(sum(s.${colonne}) FILTER (WHERE s.sport = '${sport}'), 0)::int`;

// GET /api/seances/totaux?athleteId=&from=&to=&groupe=semaine|mois
// Totaux du prévu par semaine (qui commence le lundi) ou par mois, en UNE seule requête :
// GROUP BY sur le début de la période, et sum(...) FILTER (WHERE sport = …) pour chaque sport.
// Durées et distances viennent des colonnes estimées, enregistrées avec chaque séance.
router.get('/totaux', requireAuth, async (req, res) => {
  const { from, to } = lirePeriode(req.query);
  const groupe = valider.choix(
    req.query.groupe ?? 'semaine',
    'Le regroupement (groupe)',
    Object.keys(GROUPES),
  );
  const { filtre, params } = await filtreSeancesVisibles(req);
  const n = params.length;

  const { rows } = await pool.query(
    `SELECT date_trunc($${n + 3}, s.date::timestamp)::date AS periode,
            count(*)::int AS nombre,
            COALESCE(sum(s.duree_estimee_sec), 0)::int AS "dureeSec",
            COALESCE(sum(s.dplus_prevu_m), 0)::int AS "dplusM",
            ${somme('distance_estimee_m', 'course')} AS "courseDistanceM",
            ${somme('duree_estimee_sec', 'course')} AS "courseDureeSec",
            ${somme('distance_estimee_m', 'velo')} AS "veloDistanceM",
            ${somme('duree_estimee_sec', 'velo')} AS "veloDureeSec",
            ${somme('duree_estimee_sec', 'ski_alpi')} AS "skiDureeSec",
            ${somme('dplus_prevu_m', 'ski_alpi')} AS "skiDplusM",
            ${somme('duree_estimee_sec', 'renfo')} AS "renfoDureeSec"
     FROM seances s
     WHERE ${filtre} AND s.date BETWEEN $${n + 1} AND $${n + 2}
     GROUP BY periode
     ORDER BY periode`,
    [...params, from, to, GROUPES[groupe]],
  );
  res.json(rows);
});

// POST /api/seances : le coach crée une séance pour un de ses athlètes ou pour lui-même
// (athlete_id = coach_id : pas de validation nécessaire)
router.post('/', requireAuth, requireRole('coach'), async (req, res) => {
  const athleteId = valider.identifiant(req.body?.athleteId, "L'athlète");
  const s = lireSeance(req.body);
  await verifierAccesAthlete(req.user.id, athleteId);
  s.blocs = await completerAllures(s.blocs, athleteId);
  const id = await insererSeance(req.user.id, athleteId, s);
  res.status(201).json(await trouverSeance(id));
});

// PUT /api/seances/:id : le coach modifie une de ses séances
router.put('/:id', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const s = lireSeance(req.body);

  // La condition coach_id garantit qu'un coach ne modifie que ses propres séances.
  // L'athlète de la séance sert à compléter les allures de référence avec son profil.
  const existante = await pool.query(
    'SELECT athlete_id FROM seances WHERE id = $1 AND coach_id = $2',
    [id, req.user.id],
  );
  if (!existante.rows[0]) throw new HttpError(404, 'Séance introuvable.');
  s.blocs = await completerAllures(s.blocs, existante.rows[0].athlete_id);
  await modifierSeance(id, s);
  res.json(await trouverSeance(id));
});

// POST /api/seances/:id/dupliquer : le coach copie une de ses séances à une autre date,
// pour le même athlète ou un autre de ses athlètes. La copie repart au statut "prevue".
router.post('/:id/dupliquer', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const date = valider.dateISO(req.body?.date, 'La date');
  const athleteId = valider.identifiant(req.body?.athleteId, "L'athlète");
  await verifierAccesAthlete(req.user.id, athleteId);

  // INSERT … SELECT : copie directe en base ; "WHERE coach_id" protège les séances des autres coachs
  const { rows } = await pool.query(
    `INSERT INTO seances
       (coach_id, athlete_id, date, titre, sport, type, duree_prevue_min, description, blocs,
        dplus_prevu_m, duree_estimee_sec, distance_estimee_m)
     SELECT coach_id, $1, $2, titre, sport, type, duree_prevue_min, description, blocs,
            dplus_prevu_m, duree_estimee_sec, distance_estimee_m
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
// Un nouvel envoi remplace le retour précédent. Pas de restriction de rôle : la condition
// athlete_id = utilisateur connecté suffit (un coach fait ainsi le retour de ses propres séances).
router.post('/:id/retour', requireAuth, async (req, res) => {
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
