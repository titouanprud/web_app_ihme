// Importe dans une base PostgreSQL (Neon) la sauvegarde JSON produite par GET /api/export.
//
// Usage (PowerShell) :
//   $env:DATABASE_URL = "postgres://…neon.tech/neondb?sslmode=require"
//   node scripts/importer-sauvegarde.js chemin\vers\sauvegarde.json
//
// 1. Crée les tables avec la migration habituelle (idempotente).
// 2. Vide toutes les tables de la sauvegarde, puis y copie les lignes en gardant les id.
// 3. Recale les compteurs SERIAL pour que les prochains id ne se chevauchent pas.
// Tout se fait dans une transaction : en cas d'erreur, la base n'est pas modifiée.
import fs from 'node:fs';
import { pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';

const fichier = process.argv[2];
if (!fichier) {
  console.error('Usage : node scripts/importer-sauvegarde.js sauvegarde.json');
  process.exit(1);
}
const { tables } = JSON.parse(fs.readFileSync(fichier, 'utf8'));

// Ordre d'insertion : une table après celles qu'elle référence (clés étrangères).
async function ordreTables(client, noms) {
  const { rows } = await client.query(
    `SELECT DISTINCT tc.table_name AS enfant, ccu.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );
  const ordre = [];
  const visiter = (nom, pile = new Set()) => {
    if (ordre.includes(nom) || pile.has(nom)) return;
    pile.add(nom);
    for (const r of rows) if (r.enfant === nom && r.parent !== nom) visiter(r.parent, pile);
    ordre.push(nom);
  };
  noms.forEach((n) => visiter(n));
  return ordre.filter((n) => noms.includes(n));
}

await migrate();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const { rows: existantes } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const cibles = new Set(existantes.map((r) => r.table_name));
  const absentes = Object.keys(tables).filter((n) => !cibles.has(n));
  if (absentes.length) throw new Error(`Tables absentes de la cible : ${absentes.join(', ')}`);

  const noms = await ordreTables(client, Object.keys(tables));
  const liste = noms.map((n) => client.escapeIdentifier(n)).join(', ');
  // Efface aussi ce que la migration vient d'ajouter (exercices de base, réglages).
  await client.query(`TRUNCATE ${liste} RESTART IDENTITY CASCADE`);

  for (const nom of noms) {
    const lignes = tables[nom];
    if (lignes.length) {
      // jsonb_populate_recordset convertit chaque objet JSON en ligne du bon type.
      const t = client.escapeIdentifier(nom);
      await client.query(
        `INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)`,
        [JSON.stringify(lignes)],
      );
    }
    // Recale le compteur de chaque colonne SERIAL (id) de la table.
    const { rows: series } = await client.query(
      `SELECT column_name AS col, pg_get_serial_sequence($1, column_name) AS seq
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_default LIKE 'nextval(%'`,
      [nom],
    );
    for (const { col, seq } of series) {
      const c = client.escapeIdentifier(col);
      await client.query(
        `SELECT setval($1, COALESCE((SELECT max(${c}) FROM ${client.escapeIdentifier(nom)}), 0) + 1, false)`,
        [seq],
      );
    }
    console.log(`${nom} : ${lignes.length} ligne(s)`);
  }
  await client.query('COMMIT');
  console.log('Import terminé.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Import annulé :', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
