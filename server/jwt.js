import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

let secret = process.env.JWT_SECRET;

// Le serveur du cours ne fournit que DATABASE_URL : sans JWT_SECRET, on génère
// un secret aléatoire au premier démarrage et on le garde dans app_settings.
// Les démarrages suivants relisent le même secret, donc les sessions restent valides.
export async function loadJwtSecret() {
  if (secret) return;
  await pool.query(
    `INSERT INTO app_settings (cle, valeur) VALUES ('jwt_secret', $1)
     ON CONFLICT (cle) DO NOTHING`,
    [crypto.randomBytes(48).toString('hex')],
  );
  const { rows } = await pool.query(`SELECT valeur FROM app_settings WHERE cle = 'jwt_secret'`);
  secret = rows[0].valeur;
}

// Le jeton contient l'id et le rôle de l'utilisateur, signés avec le secret.
export function signToken(user) {
  return jwt.sign({ role: user.role }, secret, { subject: String(user.id), expiresIn: '7d' });
}

// Lève une erreur si le jeton est invalide, falsifié ou expiré.
export function verifyToken(token) {
  const payload = jwt.verify(token, secret);
  return { id: Number(payload.sub), role: payload.role };
}
