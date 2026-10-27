import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { signToken } from '../jwt.js';
import * as valider from '../validation.js';

const router = Router();

// Coût du hachage bcrypt : plus il est élevé, plus une attaque par force brute est lente.
const BCRYPT_COUT = 10;

// Colonnes de l'utilisateur renvoyées au client (jamais le hash du mot de passe).
export const COLONNES_UTILISATEUR = 'id, email, prenom, nom, role';

// POST /api/auth/register : création de compte
router.post('/register', async (req, res) => {
  const body = req.body ?? {};
  const email = valider.email(body.email);
  const motDePasse = valider.motDePasse(body.motDePasse);
  const prenom = valider.texte(body.prenom, 'Le prénom', { max: 100 });
  const nom = valider.texte(body.nom, 'Le nom', { max: 100 });
  const role = valider.choix(body.role, 'Le rôle', ['coach', 'athlete']);

  const hash = await bcrypt.hash(motDePasse, BCRYPT_COUT);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, mot_de_passe_hash, prenom, nom, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLONNES_UTILISATEUR}`,
      [email, hash, prenom, nom, role],
    );
    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: { ...user, coach: null } });
  } catch (err) {
    // 23505 = violation de contrainte UNIQUE (email déjà utilisé)
    if (err.code === '23505') throw new HttpError(409, 'Un compte existe déjà avec cet email.');
    throw err;
  }
});

// POST /api/auth/login : connexion, renvoie un jeton JWT
router.post('/login', async (req, res) => {
  const body = req.body ?? {};
  const email = valider.email(body.email);
  const motDePasse = valider.texte(body.motDePasse, 'Le mot de passe', { max: 200 });

  const { rows } = await pool.query(
    `SELECT ${COLONNES_UTILISATEUR}, mot_de_passe_hash FROM users WHERE email = $1`,
    [email],
  );
  const trouve = rows[0];
  // Même message que l'email soit inconnu ou le mot de passe faux :
  // on ne révèle pas quels emails ont un compte.
  if (!trouve || !(await bcrypt.compare(motDePasse, trouve.mot_de_passe_hash))) {
    throw new HttpError(401, 'Email ou mot de passe incorrect.');
  }
  const { mot_de_passe_hash: _hash, ...user } = trouve;
  res.json({ token: signToken(user), user });
});

export default router;
