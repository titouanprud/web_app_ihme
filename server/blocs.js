import { HttpError } from './errors.js';

// Structure d'une séance en blocs, enregistrée dans la colonne JSONB seances.blocs.
//
// Bloc simple :
//   { type: 'echauffement' | 'intervalle' | 'recuperation' | 'retour_calme',
//     mesure: 'duree' | 'distance',
//     valeur: secondes (durée) ou mètres (distance),
//     cible: { type: 'allure' | 'puissance' | 'zone' | 'aucune', min, max },
//     note: texte court }
// Répétition (un seul niveau) :
//   { type: 'repetition', repetitions: 2 à 50, blocs: [blocs simples] }

export const SPORTS = ['course', 'velo', 'renfo', 'autre'];
const TYPES_BLOC = ['echauffement', 'intervalle', 'recuperation', 'retour_calme'];

// Cibles autorisées selon le sport
const CIBLES_PAR_SPORT = {
  course: ['allure', 'zone', 'aucune'],
  velo: ['puissance', 'zone', 'aucune'],
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
const MAX_BLOCS = 30;
const MAX_SOUS_BLOCS = 10;

function erreur(position, message) {
  return new HttpError(400, `Bloc ${position} : ${message}`);
}

function entierDansBornes(valeur, { min, max }) {
  return Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

function validerCible(cible, sport, position) {
  const type = cible?.type ?? 'aucune';
  if (!CIBLES_PAR_SPORT[sport].includes(type)) {
    throw erreur(position, `la cible « ${type} » n’est pas possible pour ce sport.`);
  }
  if (type === 'aucune') return { type };

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

function validerBlocSimple(bloc, sport, position) {
  if (!TYPES_BLOC.includes(bloc?.type)) throw erreur(position, 'type de bloc inconnu.');
  if (!['duree', 'distance'].includes(bloc.mesure)) {
    throw erreur(position, 'choisir une durée ou une distance.');
  }
  const bornes = BORNES_MESURE[bloc.mesure];
  if (!entierDansBornes(bloc.valeur, bornes))
    throw erreur(position, `${bornes.libelle} est invalide.`);

  const note = typeof bloc.note === 'string' ? bloc.note.trim() : '';
  if (note.length > 200) throw erreur(position, 'la note ne doit pas dépasser 200 caractères.');

  return {
    type: bloc.type,
    mesure: bloc.mesure,
    valeur: bloc.valeur,
    cible: validerCible(bloc.cible, sport, position),
    note,
  };
}

// Vérifie la liste de blocs envoyée par le client et renvoie une copie "propre"
// (sans champs inconnus). Lève une erreur 400 qui indique le bloc en cause.
export function validerBlocs(blocs, sport) {
  if (blocs === undefined || blocs === null) return [];
  if (!Array.isArray(blocs)) throw new HttpError(400, 'Les blocs doivent être une liste.');
  if (blocs.length > MAX_BLOCS) {
    throw new HttpError(400, `Une séance ne peut pas dépasser ${MAX_BLOCS} blocs.`);
  }

  return blocs.map((bloc, i) => {
    const position = String(i + 1);
    if (bloc?.type !== 'repetition') return validerBlocSimple(bloc, sport, position);

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
      blocs: bloc.blocs.map((sous, j) => validerBlocSimple(sous, sport, `${position}.${j + 1}`)),
    };
  });
}
