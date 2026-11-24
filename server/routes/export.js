import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';

// ROUTE TEMPORAIRE : export de toute la base pour la migration vers Neon.
// À supprimer dès que la sauvegarde est récupérée.
//
// GET /api/export avec l'en-tête "Authorization: Bearer <jeton>".
// Seule l'empreinte SHA-256 du jeton est dans le code ; le jeton reste sur le PC.
const EMPREINTE_JETON = Buffer.from(
  'c7358fd7e6beb7948a34c785f4b68b2a7a73c1f3213d84e7238fff666975a5fc',
  'hex',
);

function jetonValide(entete) {
  const jeton = /^Bearer (.+)$/.exec(entete || '')?.[1];
  if (!jeton) return false;
  const empreinte = crypto.createHash('sha256').update(jeton).digest();
  return crypto.timingSafeEqual(empreinte, EMPREINTE_JETON);
}

const router = Router();

router.get('/', async (req, res, next) => {
  if (!jetonValide(req.get('authorization'))) {
    return res.status(404).json({ error: 'Route inconnue' });
  }
  const client = await pool.connect();
  try {
    // Lecture cohérente : toutes les tables vues au même instant.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: tables } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );
    const donnees = {};
    for (const { table_name: nom } of tables) {
      // to_jsonb : chaque ligne telle que PostgreSQL la stocke (dates, JSONB, nombres).
      const { rows } = await client.query(
        `SELECT to_jsonb(t) AS ligne FROM ${client.escapeIdentifier(nom)} t ORDER BY 1`,
      );
      donnees[nom] = rows.map((r) => r.ligne);
    }
    await client.query('COMMIT');
    res.set('Cache-Control', 'no-store');
    res.json({ date_export: new Date().toISOString(), tables: donnees });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;
