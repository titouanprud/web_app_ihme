import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { estimerBlocs } from '../partage/estimation.js';
import * as valider from '../validation.js';
import { completerAllures, lireSeance, modifierSeance, trouverSeance } from './seances.js';

// Propositions de modification : l'athlète propose de changer la date ou le contenu d'une
// séance prévue ; la séance ne change que si le coach accepte.
// Les séances que le coach se prévoit à lui-même ne passent pas par ce circuit.
const router = Router();

// Champs que l'athlète peut proposer de changer
const CHAMPS = ['date', 'titre', 'description', 'blocs', 'dplusPrevuM'];

// Valeurs d'une séance (ligne de trouverSeance) dans le format attendu par lireSeance
function contenuActuel(seance) {
  const { date, titre, sport, type, dureePrevueMin, dplusPrevuM, description, blocs } = seance;
  return { date, titre, sport, type, dureePrevueMin, dplusPrevuM, description, blocs };
}

// Séance qui résulterait des changements : mêmes vérifications qu'une séance du coach
// (lireSeance), allures de référence complétées avec le profil de l'athlète.
// Si la structure change, la durée prévue est recalculée à partir des nouveaux blocs.
async function appliquerChangements(seance, changements) {
  const s = lireSeance({ ...contenuActuel(seance), ...changements });
  s.blocs = await completerAllures(s.blocs, seance.athleteId);
  if (changements.blocs) {
    const t = estimerBlocs(s.blocs);
    if (t.dureeComplete && t.duree > 0) s.dureePrevueMin = Math.round(t.duree / 60);
  }
  return s;
}

// Comparaison de deux valeurs JSON sans tenir compte de l'ordre des clés
// (PostgreSQL réordonne les clés des objets enregistrés en JSONB).
function trierCles(valeur) {
  if (Array.isArray(valeur)) return valeur.map(trierCles);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(
      Object.keys(valeur)
        .sort()
        .map((cle) => [cle, trierCles(valeur[cle])]),
    );
  }
  return valeur;
}
const identiques = (a, b) => JSON.stringify(trierCles(a)) === JSON.stringify(trierCles(b));

const COLONNES = `p.id, p.seance_id AS "seanceId", p.changements, p.message, p.statut, p.reponse,
  p.date_creation AS "dateCreation", p.date_reponse AS "dateReponse",
  json_build_object('id', u.id, 'prenom', u.prenom, 'nom', u.nom) AS athlete`;

// GET /api/propositions?statut=en_attente|toutes
// Le coach voit celles qui lui sont adressées, l'athlète les siennes, avec la séance actuelle
// (pour la comparaison avant / après).
router.get('/', requireAuth, async (req, res) => {
  const statut = valider.choix(req.query.statut ?? 'en_attente', 'Le statut', [
    'en_attente',
    'toutes',
  ]);
  // Nom de colonne choisi parmi deux valeurs fixes (jamais une donnée reçue du client)
  const colonne = req.user.role === 'coach' ? 'p.coach_id' : 'p.athlete_id';
  const { rows } = await pool.query(
    `SELECT ${COLONNES}
     FROM propositions_seance p
     JOIN users u ON u.id = p.athlete_id
     WHERE ${colonne} = $1 AND ($2 = 'toutes' OR p.statut = 'en_attente')
     ORDER BY p.statut = 'en_attente' DESC, p.id DESC
     LIMIT 50`,
    [req.user.id, statut],
  );
  for (const proposition of rows) proposition.seance = await trouverSeance(proposition.seanceId);
  res.json(rows);
});

// POST /api/propositions : l'athlète propose des changements sur une de ses séances prévues.
// Corps : { seanceId, changements: { date?, titre?, description?, blocs?, dplusPrevuM? }, message }
router.post('/', requireAuth, requireRole('athlete'), async (req, res) => {
  const seanceId = valider.identifiant(req.body?.seanceId, 'La séance');
  const message = valider.texte(req.body?.message, 'Le message', { max: 1000, optionnel: true });
  const recus = req.body?.changements;
  if (!recus || typeof recus !== 'object' || Array.isArray(recus)) {
    throw new HttpError(400, 'Les changements doivent être un objet.');
  }
  const inconnus = Object.keys(recus).filter((cle) => !CHAMPS.includes(cle));
  if (inconnus.length > 0) {
    throw new HttpError(400, `Champs non modifiables : ${inconnus.join(', ')}.`);
  }

  const seance = await trouverSeance(seanceId);
  // Seulement ses propres séances, préparées par son coach
  if (!seance || seance.athleteId !== req.user.id) {
    throw new HttpError(404, 'Séance introuvable.');
  }
  if (seance.statut !== 'prevue') {
    throw new HttpError(409, 'Une séance déjà réalisée ne peut plus être modifiée.');
  }

  // On garde seulement les champs qui changent vraiment, dans leur forme vérifiée
  const apres = await appliquerChangements(seance, recus);
  const changements = {};
  for (const cle of Object.keys(recus)) {
    if (!identiques(apres[cle], seance[cle])) changements[cle] = apres[cle];
  }
  if (Object.keys(changements).length === 0) {
    throw new HttpError(400, 'Aucun changement proposé.');
  }

  const coach = await pool.query('SELECT coach_id FROM seances WHERE id = $1', [seanceId]);
  try {
    const { rows } = await pool.query(
      `INSERT INTO propositions_seance (seance_id, athlete_id, coach_id, changements, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [seanceId, req.user.id, coach.rows[0].coach_id, JSON.stringify(changements), message],
    );
    res.status(201).json({ id: rows[0].id, changements, statut: 'en_attente' });
  } catch (err) {
    // 23505 : l'index unique partiel refuse une 2e proposition en attente pour la séance
    if (err.code === '23505') {
      throw new HttpError(409, 'Une proposition est déjà en attente pour cette séance.');
    }
    throw err;
  }
});

// POST /api/propositions/:id/accepter : le coach applique les changements à la séance.
// Transaction : la séance et la proposition changent ensemble, ou pas du tout.
// FOR UPDATE verrouille les deux lignes : deux réponses simultanées ne s'appliquent pas deux fois.
router.post('/:id/accepter', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const reponse = valider.texte(req.body?.reponse, 'La réponse', { max: 1000, optionnel: true });

  const client = await pool.connect();
  let seanceId;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT seance_id, changements FROM propositions_seance
       WHERE id = $1 AND coach_id = $2 AND statut = 'en_attente'
       FOR UPDATE`,
      [id, req.user.id],
    );
    if (!rows[0]) throw new HttpError(404, 'Proposition introuvable ou déjà traitée.');
    seanceId = rows[0].seance_id;

    await client.query('SELECT 1 FROM seances WHERE id = $1 FOR UPDATE', [seanceId]);
    const seance = await trouverSeance(seanceId, client);
    if (seance.statut !== 'prevue') {
      throw new HttpError(409, 'La séance a déjà été réalisée : elle ne peut plus être modifiée.');
    }
    const s = await appliquerChangements(seance, rows[0].changements);
    await modifierSeance(seanceId, s, client);
    await client.query(
      `UPDATE propositions_seance SET statut = 'acceptee', reponse = $1, date_reponse = now()
       WHERE id = $2`,
      [reponse, id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await trouverSeance(seanceId));
});

// POST /api/propositions/:id/refuser : le coach refuse, avec un message pour l'athlète
router.post('/:id/refuser', requireAuth, requireRole('coach'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const reponse = valider.texte(req.body?.reponse, 'La réponse', { max: 1000, optionnel: true });
  const { rows } = await pool.query(
    `UPDATE propositions_seance SET statut = 'refusee', reponse = $1, date_reponse = now()
     WHERE id = $2 AND coach_id = $3 AND statut = 'en_attente'
     RETURNING seance_id`,
    [reponse, id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Proposition introuvable ou déjà traitée.');
  res.json(await trouverSeance(rows[0].seance_id));
});

// DELETE /api/propositions/:id : l'athlète annule sa proposition tant qu'elle est en attente
router.delete('/:id', requireAuth, requireRole('athlete'), async (req, res) => {
  const id = valider.identifiant(req.params.id);
  const { rowCount } = await pool.query(
    `DELETE FROM propositions_seance WHERE id = $1 AND athlete_id = $2 AND statut = 'en_attente'`,
    [id, req.user.id],
  );
  if (rowCount === 0) throw new HttpError(404, 'Proposition introuvable ou déjà traitée.');
  res.status(204).end();
});

export default router;
