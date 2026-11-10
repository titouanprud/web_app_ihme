import { pool } from './db.js';
import { lireContenuSeance } from './routes/seances.js';

// Catalogue de départ : quelques modèles fictifs par sport, ajoutés une seule fois à chaque coach
// (à la création du compte, ou au premier affichage du catalogue pour les coachs existants).

const minutes = (n) => n * 60;
const bloc = (type, mesure, valeur, cible = { type: 'aucune' }, extra = {}) => ({
  type,
  mesure,
  valeur,
  cible,
  ...extra,
});
const zone = (min, max = null) => ({ type: 'zone', min, max });
const ref = (r) => ({ type: 'reference', ref: r });

export const MODELES_DE_DEPART = [
  {
    titre: 'Footing Z2',
    sport: 'course',
    type: 'endurance',
    dureePrevueMin: 45,
    description: 'Footing en aisance respiratoire, on doit pouvoir parler.',
    blocs: [bloc('intervalle', 'duree', minutes(45), zone(2))],
  },
  {
    titre: '10 × 400 m @5k',
    sport: 'course',
    type: 'fractionne',
    dureePrevueMin: 55,
    description: 'Sur piste. Récupération en trottinant.',
    blocs: [
      bloc('echauffement', 'duree', minutes(20), zone(1, 2)),
      {
        type: 'repetition',
        repetitions: 10,
        blocs: [
          bloc('intervalle', 'distance', 400, ref('5k')),
          bloc('recuperation', 'duree', 60, zone(1)),
        ],
      },
      bloc('retour_calme', 'duree', minutes(10), zone(1)),
    ],
  },
  {
    titre: '3 × 3 km @21k',
    sport: 'course',
    type: 'fractionne',
    dureePrevueMin: 75,
    description: 'Travail à allure semi-marathon.',
    blocs: [
      bloc('echauffement', 'duree', minutes(20), zone(1, 2)),
      {
        type: 'repetition',
        repetitions: 3,
        blocs: [
          bloc('intervalle', 'distance', 3000, ref('21k')),
          bloc('recuperation', 'duree', minutes(3), zone(1)),
        ],
      },
      bloc('retour_calme', 'duree', minutes(10), zone(1)),
    ],
  },
  {
    titre: 'Sortie longue',
    sport: 'course',
    type: 'endurance',
    dureePrevueMin: 90,
    description: 'Allure facile, ravitaillement à prévoir.',
    blocs: [bloc('intervalle', 'duree', minutes(90), zone(2))],
  },
  {
    titre: 'Vélo endurance',
    sport: 'velo',
    type: 'endurance',
    dureePrevueMin: 120,
    description: 'Sortie régulière, pédalage souple.',
    blocs: [bloc('intervalle', 'duree', minutes(120), zone(2))],
  },
  {
    titre: '3 × 10 min Z4',
    sport: 'velo',
    type: 'fractionne',
    dureePrevueMin: 70,
    description: '',
    blocs: [
      bloc('echauffement', 'duree', minutes(20), zone(1, 2)),
      {
        type: 'repetition',
        repetitions: 3,
        blocs: [
          bloc('intervalle', 'duree', minutes(10), zone(4)),
          bloc('recuperation', 'duree', minutes(5), zone(1)),
        ],
      },
      bloc('retour_calme', 'duree', minutes(5), zone(1)),
    ],
  },
  {
    titre: 'Ski-alpinisme endurance',
    sport: 'ski_alpi',
    type: 'endurance',
    dureePrevueMin: 180,
    description: 'Montée régulière, descente prudente.',
    blocs: [bloc('intervalle', 'duree', minutes(180), zone(2), { dplus: 1200 })],
  },
  {
    titre: 'Montées au seuil',
    sport: 'ski_alpi',
    type: 'fractionne',
    dureePrevueMin: 110,
    description: 'Montées au seuil, descentes en récupération.',
    blocs: [
      bloc('echauffement', 'duree', minutes(20), zone(1, 2), { dplus: 150 }),
      {
        type: 'repetition',
        repetitions: 4,
        blocs: [
          bloc('intervalle', 'duree', minutes(12), zone(4), { dplus: 200 }),
          bloc('recuperation', 'duree', minutes(10), zone(1), { note: 'descente' }),
        ],
      },
      bloc('retour_calme', 'duree', minutes(10), zone(1)),
    ],
  },
  {
    titre: 'Gainage',
    sport: 'renfo',
    type: 'renfo',
    dureePrevueMin: 30,
    description: 'Planche, planche latérale, pont fessier, superman : 3 tours.',
    blocs: [],
  },
  {
    titre: 'Circuit jambes',
    sport: 'renfo',
    type: 'renfo',
    dureePrevueMin: 45,
    description: 'Squats, fentes, montées sur banc, mollets : 4 tours, 1 min de récupération.',
    blocs: [],
  },
];

// Ajoute le catalogue de départ si le coach ne l'a jamais reçu.
// La colonne users.catalogue_initialise garde la trace : un coach qui supprime ces modèles
// ne les voit pas revenir. Le drapeau et les modèles sont écrits dans la même transaction.
export async function initialiserCatalogue(coachId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Seul le premier appel modifie la ligne (rowCount = 1) ; les suivants ne font rien.
    const { rowCount } = await client.query(
      `UPDATE users SET catalogue_initialise = true
       WHERE id = $1 AND role = 'coach' AND NOT catalogue_initialise`,
      [coachId],
    );
    if (rowCount === 1) {
      for (const modele of MODELES_DE_DEPART) {
        // Mêmes vérifications qu'un modèle saisi par le coach
        const s = lireContenuSeance(modele, { modele: true });
        await client.query(
          `INSERT INTO seances_types
             (coach_id, titre, sport, type, duree_prevue_min, description, blocs, dplus_prevu_m)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            coachId,
            s.titre,
            s.sport,
            s.type,
            s.dureePrevueMin,
            s.description,
            JSON.stringify(s.blocs),
            s.dplusPrevuM,
          ],
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
