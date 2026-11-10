import { HttpError } from './errors.js';
import { REFERENCES } from './partage/estimation.js';

// Structure d'une séance en blocs, enregistrée dans la colonne JSONB seances.blocs.
//
// Bloc simple :
//   { type: 'echauffement' | 'intervalle' | 'recuperation' | 'retour_calme',
//     mesure: 'duree' | 'distance',
//     valeur: secondes (durée) ou mètres (distance),
//     cible: { type: 'allure' | 'puissance' | 'zone' | 'aucune', min, max }
//         ou { type: 'reference', ref: '5k' | '10k' | '21k' | '42k' | 'sv1' | 'sv2',
//              allure_sec: allure copiée du profil (s/km), modifiee: true si le coach l'a changée },
//     dplus: dénivelé positif visé en mètres (facultatif : course, vélo, ski-alpinisme),
//     note: texte court }
// Répétition (un seul niveau) :
//   { type: 'repetition', repetitions: 2 à 50, blocs: [blocs simples] }

export const SPORTS = ['course', 'velo', 'ski_alpi', 'renfo', 'autre'];
// Sports pour lesquels un D+ (dénivelé positif) peut être prévu
export const SPORTS_AVEC_DPLUS = ['course', 'velo', 'ski_alpi'];
const TYPES_BLOC = ['echauffement', 'intervalle', 'recuperation', 'retour_calme'];

// Cibles autorisées selon le sport
const CIBLES_PAR_SPORT = {
  course: ['allure', 'reference', 'zone', 'aucune'],
  velo: ['puissance', 'zone', 'aucune'],
  ski_alpi: ['zone', 'aucune'],
  renfo: ['zone', 'aucune'],
  autre: ['zone', 'aucune'],
};

// Bornes des valeurs (allure en secondes par km, puissance en watts)
const BORNES_CIBLE = {
  allure: { min: 120, max: 1200, libelle: 'L’allure (entre 2:00 et 20:00 /km)' },
  puissance: { min: 30, max: 2000, libelle: 'La puissance (entre 30 et 2000 W)' },
  zone: { min: 1, max: 5, libelle: 'La zone (entre 1 et 5)' },
};
const BORNES_MESURE = {
  duree: { min: 10, max: 6 * 3600, libelle: 'La durée (entre 0:10 et 6:00:00)' },
  distance: { min: 50, max: 300000, libelle: 'La distance (entre 50 m et 300 km)' },
};
const BORNES_DPLUS = { min: 0, max: 10000 };
const MAX_BLOCS = 30;
const MAX_SOUS_BLOCS = 10;

function erreur(position, message) {
  return new HttpError(400, `Bloc ${position} : ${message}`);
}

function entierDansBornes(valeur, { min, max }) {
  return Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

// Allure de référence. Pour un modèle (modele = true), l'allure n'est pas gardée :
// elle sera calculée avec le profil de l'athlète quand la séance sera créée pour lui.
// Pour une séance, une allure absente est complétée ensuite par la route (profil de l'athlète).
function validerReference(cible, position, modele) {
  if (!REFERENCES.includes(cible.ref)) {
    throw erreur(position, `la référence doit valoir : ${REFERENCES.join(', ')}.`);
  }
  if (modele) return { type: 'reference', ref: cible.ref, allure_sec: null, modifiee: false };

  const allure = cible.allure_sec ?? null;
  if (allure !== null && !entierDansBornes(allure, BORNES_CIBLE.allure)) {
    throw erreur(position, `${BORNES_CIBLE.allure.libelle} est invalide.`);
  }
  return {
    type: 'reference',
    ref: cible.ref,
    allure_sec: allure,
    modifiee: cible.modifiee === true,
  };
}

function validerCible(cible, sport, position, modele) {
  const type = cible?.type ?? 'aucune';
  if (!CIBLES_PAR_SPORT[sport].includes(type)) {
    throw erreur(position, `la cible « ${type} » n’est pas possible pour ce sport.`);
  }
  if (type === 'aucune') return { type };
  if (type === 'reference') return validerReference(cible, position, modele);

  const bornes = BORNES_CIBLE[type];
  const min = cible.min;
  const max = cible.max ?? null;
  if (!entierDansBornes(min, bornes) || (max !== null && !entierDansBornes(max, bornes))) {
    throw erreur(position, `${bornes.libelle} est invalide.`);
  }
  if (max !== null && max < min) {
    throw erreur(position, 'la fin de la fourchette doit être supérieure au début.');
  }
  return { type, min, max };
}

function validerBlocSimple(bloc, sport, position, modele) {
  if (!TYPES_BLOC.includes(bloc?.type)) throw erreur(position, 'type de bloc inconnu.');
  if (!['duree', 'distance'].includes(bloc.mesure)) {
    throw erreur(position, 'choisir une durée ou une distance.');
  }
  const bornes = BORNES_MESURE[bloc.mesure];
  if (!entierDansBornes(bloc.valeur, bornes))
    throw erreur(position, `${bornes.libelle} est invalide.`);

  const note = typeof bloc.note === 'string' ? bloc.note.trim() : '';
  if (note.length > 200) throw erreur(position, 'la note ne doit pas dépasser 200 caractères.');

  const propre = {
    type: bloc.type,
    mesure: bloc.mesure,
    valeur: bloc.valeur,
    cible: validerCible(bloc.cible, sport, position, modele),
    note,
  };

  // D+ facultatif : la clé n'est enregistrée que si une valeur est donnée
  if (bloc.dplus !== undefined && bloc.dplus !== null && bloc.dplus !== '') {
    if (!SPORTS_AVEC_DPLUS.includes(sport)) {
      throw erreur(position, 'le D+ n’est possible qu’en course, vélo et ski-alpinisme.');
    }
    if (!entierDansBornes(bloc.dplus, BORNES_DPLUS)) {
      throw erreur(position, 'le D+ doit être un nombre entier de mètres entre 0 et 10 000.');
    }
    propre.dplus = bloc.dplus;
  }
  return propre;
}

// Vérifie la liste de blocs envoyée par le client et renvoie une copie "propre"
// (sans champs inconnus). Lève une erreur 400 qui indique le bloc en cause.
// modele = true pour un modèle du catalogue (références gardées sans allure).
export function validerBlocs(blocs, sport, { modele = false } = {}) {
  if (blocs === undefined || blocs === null) return [];
  if (!Array.isArray(blocs)) throw new HttpError(400, 'Les blocs doivent être une liste.');
  if (blocs.length > MAX_BLOCS) {
    throw new HttpError(400, `Une séance ne peut pas dépasser ${MAX_BLOCS} blocs.`);
  }

  return blocs.map((bloc, i) => {
    const position = String(i + 1);
    if (bloc?.type !== 'repetition') return validerBlocSimple(bloc, sport, position, modele);

    if (!entierDansBornes(bloc.repetitions, { min: 2, max: 50 })) {
      throw erreur(position, 'le nombre de répétitions doit être entre 2 et 50.');
    }
    if (!Array.isArray(bloc.blocs) || bloc.blocs.length === 0) {
      throw erreur(position, 'une répétition doit contenir au moins un bloc.');
    }
    if (bloc.blocs.length > MAX_SOUS_BLOCS) {
      throw erreur(position, `une répétition ne peut pas dépasser ${MAX_SOUS_BLOCS} blocs.`);
    }
    return {
      type: 'repetition',
      repetitions: bloc.repetitions,
      // Pas de répétition dans une répétition : validerBlocSimple refuse le type "repetition"
      blocs: bloc.blocs.map((sous, j) =>
        validerBlocSimple(sous, sport, `${position}.${j + 1}`, modele),
      ),
    };
  });
}
