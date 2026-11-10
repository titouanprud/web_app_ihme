// Logique du calendrier (sans affichage) : périodes de chaque vue, navigation, totaux.
import {
  ajouterJours,
  debutMois,
  debutSemaine,
  finMois,
  formaterDate,
  parseISODate,
} from './dates.js';

export const VUES = [
  { value: 'jour', label: 'Jour' },
  { value: 'semaine', label: 'Semaine' },
  { value: 'mois', label: 'Mois' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'annee', label: 'Année' },
];

const NOMBRE_DE_MOIS = { mois: 1, trimestre: 3, annee: 12 };

const lundiDe = (iso) => debutSemaine(parseISODate(iso));

// Période affichée par une vue autour d'une date :
// - debut / fin : la période elle-même (ex. du 1er au 31 octobre) ;
// - grilleDebut / grilleFin : élargie à des semaines complètes, du lundi au dimanche.
export function periodeAffichee(vue, date) {
  if (vue === 'jour') return { debut: date, fin: date, grilleDebut: date, grilleFin: date };
  if (vue === 'semaine') {
    const lundi = lundiDe(date);
    const dimanche = ajouterJours(lundi, 6);
    return { debut: lundi, fin: dimanche, grilleDebut: lundi, grilleFin: dimanche };
  }
  const mois = parseISODate(date).getMonth();
  // Premier mois de la période : celui de la date, du trimestre (0, 3, 6, 9) ou janvier
  const decalage = { mois: 0, trimestre: -(mois % 3), annee: -mois }[vue];
  const debut = debutMois(date, decalage);
  const fin = finMois(debutMois(debut, NOMBRE_DE_MOIS[vue] - 1));
  return { debut, fin, grilleDebut: lundiDe(debut), grilleFin: ajouterJours(lundiDe(fin), 6) };
}

// Date de la période précédente (sens = -1) ou suivante (sens = +1)
export function decaler(vue, date, sens) {
  if (vue === 'jour') return ajouterJours(date, sens);
  if (vue === 'semaine') return ajouterJours(date, 7 * sens);
  return debutMois(date, NOMBRE_DE_MOIS[vue] * sens);
}

// Titre de la période, ex. "novembre 2026", "T4 2026", "9 nov. – 15 nov. 2026"
export function libellePeriode(vue, date) {
  const { debut, fin } = periodeAffichee(vue, date);
  const annee = parseISODate(debut).getFullYear();
  if (vue === 'jour') {
    return formaterDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  if (vue === 'semaine') {
    return `${formaterDate(debut, { day: 'numeric', month: 'short' })} – ${formaterDate(fin, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  }
  if (vue === 'mois') return formaterDate(debut, { month: 'long', year: 'numeric' });
  if (vue === 'trimestre') return `T${Math.floor(parseISODate(debut).getMonth() / 3) + 1} ${annee}`;
  return String(annee);
}

// La date du jour appartient-elle à la période affichée ?
export function contientAujourdhui(vue, date, aujourdhui) {
  const { debut, fin } = periodeAffichee(vue, date);
  return aujourdhui >= debut && aujourdhui <= fin;
}

// Lundis des semaines de la grille
export function semainesDeLaGrille(grilleDebut, grilleFin) {
  const lundis = [];
  for (let lundi = grilleDebut; lundi <= grilleFin; lundi = ajouterJours(lundi, 7)) {
    lundis.push(lundi);
  }
  return lundis;
}

// Premiers jours des mois de la période
export function moisDeLaPeriode(debut, fin) {
  const mois = [];
  for (let m = debut; m <= fin; m = debutMois(m, 1)) mois.push(m);
  return mois;
}

// Une semaine à cheval sur deux mois est rangée dans le mois de son jeudi
// (même règle que la numérotation officielle des semaines, ISO 8601).
export function moisDeLaSemaine(lundi) {
  return debutMois(ajouterJours(lundi, 3));
}

// ----- Totaux (renvoyés par GET /api/seances/totaux) -----

export const CLES_TOTAUX = [
  'nombre',
  'dureeSec',
  'dplusM',
  'courseDistanceM',
  'courseDureeSec',
  'veloDistanceM',
  'veloDureeSec',
  'skiDureeSec',
  'skiDplusM',
  'renfoDureeSec',
];

// Additionne plusieurs lignes de totaux (ex. les mois d'une année)
export function additionnerTotaux(lignes) {
  const total = Object.fromEntries(CLES_TOTAUX.map((cle) => [cle, 0]));
  for (const ligne of lignes) {
    for (const cle of CLES_TOTAUX) total[cle] += ligne?.[cle] ?? 0;
  }
  return total;
}

// Liste de l'API → objet indexé par début de période, ex. { '2026-11-09': {…} }
export function indexerParPeriode(lignes) {
  return Object.fromEntries((lignes ?? []).map((l) => [l.periode, l]));
}
