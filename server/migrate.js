import { pool } from './db.js';
import { allureIndicative, estimerSeance } from './partage/estimation.js';
import { lireProfil } from './routes/profil.js';

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

-- Retour de l'athlète : difficulté de la séance et forme ressentie (1 à 10).
-- Les anciennes colonnes ressenti et duree_reelle_min sont conservées mais plus utilisées.
ALTER TABLE retours ADD COLUMN IF NOT EXISTS difficulte INTEGER CHECK (difficulte BETWEEN 1 AND 10);
ALTER TABLE retours ADD COLUMN IF NOT EXISTS forme INTEGER CHECK (forme BETWEEN 1 AND 10);

-- Bibliothèque de séances types (modèles sans date) de chaque coach
CREATE TABLE IF NOT EXISTS seances_types (
  id               SERIAL PRIMARY KEY,
  coach_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titre            TEXT NOT NULL,
  sport            TEXT NOT NULL,
  type             TEXT NOT NULL,
  duree_prevue_min INTEGER CHECK (duree_prevue_min BETWEEN 0 AND 1440),
  description      TEXT NOT NULL DEFAULT '',
  blocs            JSONB NOT NULL DEFAULT '[]'
);

-- D+ (dénivelé positif) prévu en mètres : somme des D+ des blocs, ou saisi directement
ALTER TABLE seances ADD COLUMN IF NOT EXISTS dplus_prevu_m INTEGER
  CHECK (dplus_prevu_m BETWEEN 0 AND 20000);
ALTER TABLE seances_types ADD COLUMN IF NOT EXISTS dplus_prevu_m INTEGER
  CHECK (dplus_prevu_m BETWEEN 0 AND 20000);

-- Durée (s) et distance (m) estimées à partir des blocs, calculées à chaque enregistrement
-- pour que les totaux du calendrier soient une simple somme SQL.
-- NULL = pas encore calculée (séance créée avant ces colonnes) : voir completerEstimations().
ALTER TABLE seances ADD COLUMN IF NOT EXISTS duree_estimee_sec INTEGER;
ALTER TABLE seances ADD COLUMN IF NOT EXISTS distance_estimee_m INTEGER;

-- true quand le coach a reçu le catalogue de départ (voir server/catalogueDepart.js) :
-- les modèles qu'il supprime ensuite ne sont pas recréés.
ALTER TABLE users ADD COLUMN IF NOT EXISTS catalogue_initialise BOOLEAN NOT NULL DEFAULT false;

-- Records personnels de l'athlète (saisis par lui ou son coach) : un temps par distance
CREATE TABLE IF NOT EXISTS records (
  athlete_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  distance    TEXT NOT NULL CHECK (distance IN ('5k', '10k', 'semi', 'marathon')),
  temps_sec   INTEGER NOT NULL CHECK (temps_sec > 0),
  date_record DATE,
  PRIMARY KEY (athlete_id, distance)
);
-- Records sur 1200 m et 3600 m (vitesse critique) : la contrainte des distances est
-- remplacée par une version plus large (DROP puis ADD, rejouable sans risque).
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_distance_check;
ALTER TABLE records ADD CONSTRAINT records_distance_check
  CHECK (distance IN ('1200m', '3600m', '5k', '10k', 'semi', 'marathon'));

-- Seuils ventilatoires SV1 / SV2 estimés par le coach (allure en s/km, FC en bpm)
CREATE TABLE IF NOT EXISTS seuils (
  athlete_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sv1_allure_sec INTEGER CHECK (sv1_allure_sec BETWEEN 120 AND 1200),
  sv1_fc         INTEGER CHECK (sv1_fc BETWEEN 60 AND 230),
  sv2_allure_sec INTEGER CHECK (sv2_allure_sec BETWEEN 120 AND 1200),
  sv2_fc         INTEGER CHECK (sv2_fc BETWEEN 60 AND 230),
  date_maj       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zones 1 à 5 de l'athlète, définies par le coach : allures (s/km, min = la plus rapide)
-- et fréquences cardiaques. Chaque valeur est facultative.
CREATE TABLE IF NOT EXISTS zones (
  athlete_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone           INTEGER NOT NULL CHECK (zone BETWEEN 1 AND 5),
  allure_min_sec INTEGER CHECK (allure_min_sec BETWEEN 120 AND 1200),
  allure_max_sec INTEGER CHECK (allure_max_sec BETWEEN 120 AND 1200),
  fc_min         INTEGER CHECK (fc_min BETWEEN 40 AND 230),
  fc_max         INTEGER CHECK (fc_max BETWEEN 40 AND 230),
  PRIMARY KEY (athlete_id, zone)
);

-- Base d'exercices de renforcement : coach_id NULL = base commune, sinon exercice d'un coach.
-- Index unique sur (coach, nom sans majuscules) ; COALESCE car NULL n'est jamais égal à NULL.
CREATE TABLE IF NOT EXISTS exercices (
  id        SERIAL PRIMARY KEY,
  coach_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  nom       TEXT NOT NULL,
  categorie TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS exercices_nom_idx
  ON exercices ((COALESCE(coach_id, 0)), (lower(nom)));

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

-- Cycles d'entraînement de plusieurs semaines (du lundi au dimanche), créés par le coach.
-- Deux cycles du même athlète ne se chevauchent pas : vérifié par la route (server/routes/cycles.js).
-- ISODOW : jour de la semaine de 1 (lundi) à 7 (dimanche).
CREATE TABLE IF NOT EXISTS cycles (
  id         SERIAL PRIMARY KEY,
  coach_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('preparation_generale', 'specifique', 'affutage',
                                           'recuperation', 'competition', 'autre')),
  date_debut DATE NOT NULL CHECK (EXTRACT(ISODOW FROM date_debut) = 1),
  date_fin   DATE NOT NULL CHECK (EXTRACT(ISODOW FROM date_fin) = 7),
  objectif   TEXT NOT NULL DEFAULT '',
  couleur    TEXT NOT NULL DEFAULT '#2563eb',
  CHECK (date_fin > date_debut)
);
CREATE INDEX IF NOT EXISTS cycles_athlete_dates_idx ON cycles (athlete_id, date_debut);

-- Propositions de l'athlète pour changer une séance prévue (date ou contenu).
-- changements (JSONB) : seulement les champs modifiés, ex. { "date": "2026-11-12" }.
-- La séance ne change que lorsque le coach accepte.
CREATE TABLE IF NOT EXISTS propositions_seance (
  id            SERIAL PRIMARY KEY,
  seance_id     INTEGER NOT NULL REFERENCES seances(id) ON DELETE CASCADE,
  athlete_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changements   JSONB NOT NULL,
  message       TEXT NOT NULL DEFAULT '',
  statut        TEXT NOT NULL DEFAULT 'en_attente'
                CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
  reponse       TEXT NOT NULL DEFAULT '',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_reponse  TIMESTAMPTZ
);
-- Index unique "partiel" : au plus UNE proposition en attente par séance
-- (les propositions acceptées ou refusées, elles, peuvent être nombreuses).
CREATE UNIQUE INDEX IF NOT EXISTS propositions_une_en_attente_idx
  ON propositions_seance (seance_id) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS propositions_coach_idx ON propositions_seance (coach_id, statut);

CREATE TABLE IF NOT EXISTS app_settings (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`;

// Numéro arbitraire qui identifie le verrou de migration.
const VERROU_MIGRATION = 20261027;

// Base commune d'exercices de renforcement (ajoutée une fois, jamais en double)
const EXERCICES_DE_BASE = {
  jambes: [
    'Squat',
    'Squat bulgare',
    'Fentes avant',
    'Fentes marchées',
    'Soulevé de terre',
    'Soulevé de terre jambes tendues',
    'Hip thrust',
    'Pont fessier',
    'Montées sur banc',
    'Presse à cuisses',
    'Leg curl',
    'Mollets debout',
    'Chaise',
  ],
  haut_du_corps: [
    'Pompes',
    'Développé couché',
    'Développé militaire',
    'Tractions',
    'Rowing haltère',
    'Dips',
    'Tirage horizontal',
  ],
  gainage: [
    'Planche',
    'Planche latérale',
    'Superman',
    'Dead bug',
    'Bird dog',
    'Crunch',
    'Relevés de jambes',
    'Rotations russes',
  ],
  pliometrie: [
    'Sauts de grenouille',
    'Squats sautés',
    'Bondissements',
    'Corde à sauter',
    'Box jump',
  ],
  mobilite: ['Mobilité de hanche', 'Étirements ischio-jambiers', 'Fentes avec rotation'],
};

async function ajouterExercicesDeBase(client) {
  for (const [categorie, noms] of Object.entries(EXERCICES_DE_BASE)) {
    for (const nom of noms) {
      await client.query(
        `INSERT INTO exercices (coach_id, nom, categorie) VALUES (NULL, $1, $2)
         ON CONFLICT ((COALESCE(coach_id, 0)), (lower(nom))) DO NOTHING`,
        [nom, categorie],
      );
    }
  }
}

// Version de la règle d'estimation. La version 2 donne une distance indicative aux blocs
// sans allure (allure de la zone 2, de SV1 ou par défaut) : les séances calculées avec
// une version plus ancienne sont recalculées une fois.
const VERSION_ESTIMATION = '2';

// Calcule la durée et la distance estimées des séances, en JavaScript (même fonction que les
// routes, avec le profil de chaque athlète). Ne touche que les séances pas encore calculées,
// ou toutes si la règle d'estimation a changé : relancer la migration ne refait rien.
async function completerEstimations(client) {
  const version = await client.query(
    `SELECT valeur FROM app_settings WHERE cle = 'version_estimation'`,
  );
  const aJour = version.rows[0]?.valeur === VERSION_ESTIMATION;
  const { rows } = await client.query(
    `SELECT id, athlete_id, sport, blocs, duree_prevue_min FROM seances
     ${aJour ? 'WHERE duree_estimee_sec IS NULL' : ''}`,
  );
  const profils = new Map();
  for (const seance of rows) {
    if (!profils.has(seance.athlete_id)) {
      profils.set(seance.athlete_id, await lireProfil(seance.athlete_id, client));
    }
    const allure = allureIndicative(seance.sport, profils.get(seance.athlete_id));
    const { dureeSec, distanceM } = estimerSeance(seance.blocs, seance.duree_prevue_min, allure);
    await client.query(
      'UPDATE seances SET duree_estimee_sec = $1, distance_estimee_m = $2 WHERE id = $3',
      [dureeSec, distanceM, seance.id],
    );
  }
  await client.query(
    `INSERT INTO app_settings (cle, valeur) VALUES ('version_estimation', $1)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [VERSION_ESTIMATION],
  );
}

export async function migrate() {
  const client = await pool.connect();
  try {
    // Le verrou évite que deux processus lancés en même temps créent les tables en parallèle.
    await client.query('SELECT pg_advisory_lock($1)', [VERROU_MIGRATION]);
    await client.query(SCHEMA);
    await ajouterExercicesDeBase(client);
    await completerEstimations(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [VERROU_MIGRATION]).catch(() => {});
    client.release();
  }
}
