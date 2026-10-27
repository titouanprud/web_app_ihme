import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';

const router = Router();

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) pour faciliter la saisie.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 8;
const VALIDITE_JOURS = 7;

function genererCode() {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

// POST /api/invitations : le coach génère un code, valable 7 jours,
// qu'il peut partager avec un ou plusieurs athlètes.
router.post('/', requireAuth, requireRole('coach'), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO invitations (coach_id, code, date_expiration)
     VALUES ($1, $2, now() + make_interval(days => $3))
     RETURNING code, date_expiration AS "dateExpiration"`,
    [req.user.id, genererCode(), VALIDITE_JOURS],
  );
  res.status(201).json(rows[0]);
});

// POST /api/invitations/accept : l'athlète rejoint un coach avec un code
router.post('/accept', requireAuth, requireRole('athlete'), async (req, res) => {
  const code = valider.texte(req.body?.code, 'Le code', { max: 20 }).toUpperCase();

  const { rows } = await pool.query(
    `SELECT i.coach_id, u.prenom, u.nom
     FROM invitations i JOIN users u ON u.id = i.coach_id
     WHERE i.code = $1 AND i.date_expiration > now()`,
    [code],
  );
  const invitation = rows[0];
  if (!invitation) throw new HttpError(404, 'Code d’invitation invalide ou expiré.');

  try {
    await pool.query('INSERT INTO coach_athletes (coach_id, athlete_id) VALUES ($1, $2)', [
      invitation.coach_id,
      req.user.id,
    ]);
  } catch (err) {
    // athlete_id est UNIQUE : un athlète n'a qu'un seul coach
    if (err.code === '23505') throw new HttpError(409, 'Vous avez déjà un coach.');
    throw err;
  }
  res.status(201).json({
    coach: { id: invitation.coach_id, prenom: invitation.prenom, nom: invitation.nom },
  });
});

export default router;
