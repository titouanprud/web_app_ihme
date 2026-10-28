import { pool } from './db.js';

// Migration idempotente : peut être relancée à chaque démarrage sans rien casser.
// "IF NOT EXISTS" crée seulement ce qui manque et ne supprime jamais de données.
// ON DELETE CASCADE : supprimer un utilisateur supprime aussi ce qui lui appartient.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  mot_de_passe_hash TEXT NOT NULL,
  prenom            TEXT NOT NULL,
  nom               TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('coach', 'athlete')),
  date_creation     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lien coach / athlète. Une ligne = une demande de l'athlète, puis le lien une fois accepté.
-- athlete_id est UNIQUE : un athlète n'a qu'un coach (ou une seule demande) à la fois.
CREATE TABLE IF NOT EXISTS coach_athletes (
  id         SERIAL PRIMARY KEY,
  coach_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  date_ajout TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Colonne ajoutée avec les demandes : les liens déjà existants restent "acceptee".
ALTER TABLE coach_athletes ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'acceptee'
  CHECK (statut IN ('en_attente', 'acceptee', 'refusee'));

CREATE TABLE IF NOT EXISTS seances (
  id               SERIAL PRIMARY KEY,
  coach_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  titre            TEXT NOT NULL,
  sport            TEXT NOT NULL,
  type             TEXT NOT NULL,
  duree_prevue_min INTEGER CHECK (duree_prevue_min BETWEEN 0 AND 1440),
  description      TEXT NOT NULL DEFAULT '',
  statut           TEXT NOT NULL DEFAULT 'prevue'
                   CHECK (statut IN ('prevue', 'realisee', 'non_realisee'))
);
CREATE INDEX IF NOT EXISTS seances_athlete_date_idx ON seances (athlete_id, date);
-- Structure de la séance en blocs (échauffement, intervalles…), voir server/blocs.js
ALTER TABLE seances ADD COLUMN IF NOT EXISTS blocs JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS retours (
  id               SERIAL PRIMARY KEY,
  seance_id        INTEGER NOT NULL UNIQUE REFERENCES seances(id) ON DELETE CASCADE,
  ressenti         INTEGER CHECK (ressenti BETWEEN 1 AND 10),
  duree_reelle_min INTEGER CHECK (duree_reelle_min BETWEEN 0 AND 1440),
  commentaire      TEXT NOT NULL DEFAULT '',
  date             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messagerie : une conversation par binôme coach / athlète.
CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  coach_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auteur_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contenu    TEXT NOT NULL,
  date_envoi TIMESTAMPTZ NOT NULL DEFAULT now(),
  lu         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (coach_id, athlete_id, id);

CREATE TABLE IF NOT EXISTS app_settings (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`;

// Numéro arbitraire qui identifie le verrou de migration.
const VERROU_MIGRATION = 20261027;

export async function migrate() {
  const client = await pool.connect();
  try {
    // Le verrou évite que deux processus lancés en même temps créent les tables en parallèle.
    await client.query('SELECT pg_advisory_lock($1)', [VERROU_MIGRATION]);
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [VERROU_MIGRATION]).catch(() => {});
    client.release();
  }
}
