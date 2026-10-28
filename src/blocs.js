// Outils pour les blocs de séance (même structure que server/blocs.js) :
// libellés, valeurs par défaut, formatage des durées / distances / allures et totaux.

export const SPORTS = [
  { value: 'course', label: 'Course à pied' },
  { value: 'velo', label: 'Vélo' },
  { value: 'renfo', label: 'Renforcement' },
  { value: 'autre', label: 'Autre' },
];

// Les anciennes séances ont un sport en texte libre : on l'affiche tel quel.
export function libelleSport(sport) {
  return SPORTS.find((s) => s.value === sport)?.label ?? sport;
}

export const TYPES_BLOC = {
  echauffement: 'Échauffement',
  intervalle: 'Intervalle',
  recuperation: 'Récupération',
  retour_calme: 'Retour au calme',
  repetition: 'Répétition',
};

export const CIBLES_PAR_SPORT = {
  course: ['allure', 'zone', 'aucune'],
  velo: ['puissance', 'zone', 'aucune'],
  renfo: ['zone', 'aucune'],
  autre: ['zone', 'aucune'],
};

export const LIBELLES_CIBLE = {
  allure: 'Allure (min/km)',
  puissance: 'Puissance (W)',
  zone: 'Zone (1 à 5)',
  aucune: 'Sans cible',
};

// Valeur de départ quand on choisit un type de cible
const CIBLE_PAR_DEFAUT = {
  allure: { type: 'allure', min: 300, max: null },
  puissance: { type: 'puissance', min: 200, max: null },
  zone: { type: 'zone', min: 2, max: null },
  aucune: { type: 'aucune' },
};

export function cibleParDefaut(type) {
  return { ...CIBLE_PAR_DEFAUT[type] };
}

// Nouveau bloc pré-rempli selon son type et le sport
export function nouveauBloc(type, sport) {
  if (type === 'repetition') {
    return {
      type,
      repetitions: 4,
      blocs: [nouveauBloc('intervalle', sport), nouveauBloc('recuperation', sport)],
    };
  }
  const zone = (min) => ({ type: 'zone', min, max: null });
  if (type === 'intervalle') {
    if (sport === 'course') {
      return { type, mesure: 'distance', valeur: 1000, cible: cibleParDefaut('allure'), note: '' };
    }
    if (sport === 'velo') {
      return { type, mesure: 'duree', valeur: 300, cible: cibleParDefaut('puissance'), note: '' };
    }
    return { type, mesure: 'duree', valeur: 60, cible: zone(4), note: '' };
  }
  const duree = { echauffement: 900, recuperation: 120, retour_calme: 600 }[type];
  return { type, mesure: 'duree', valeur: duree, cible: zone(1), note: '' };
}

// Quand le sport change, les cibles impossibles pour le nouveau sport sont retirées.
export function adapterAuSport(blocs, sport) {
  const adapter = (bloc) => {
    if (bloc.type === 'repetition') return { ...bloc, blocs: bloc.blocs.map(adapter) };
    const permise = CIBLES_PAR_SPORT[sport].includes(bloc.cible?.type ?? 'aucune');
    return permise ? bloc : { ...bloc, cible: cibleParDefaut('aucune') };
  };
  return blocs.map(adapter);
}

// ----- Formatage et lecture des valeurs -----

// 270 → "4:30" ; 3725 → "1:02:05"
export function formaterChrono(secondes) {
  if (secondes === null || secondes === undefined) return '';
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// "4:30" → 270 ; "1:02:05" → 3725 ; "10" → 600 (un nombre seul = des minutes)
export function lireChrono(texte) {
  const t = texte.trim();
  if (/^\d+$/.test(t)) return Number(t) * 60;
  const morceaux = t.split(':');
  if (morceaux.length < 2 || morceaux.length > 3 || !morceaux.every((p) => /^\d+$/.test(p))) {
    return null;
  }
  const [a, b, c] = morceaux.map(Number);
  if (morceaux.length === 2) return b < 60 ? a * 60 + b : null;
  return b < 60 && c < 60 ? a * 3600 + b * 60 + c : null;
}

// 400 → "400 m" ; 1500 → "1,5 km"
export function formaterDistance(metres) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = Math.round(metres / 10) / 100;
  return `${String(km).replace('.', ',')} km`;
}

// "400", "400 m" → 400 ; "1,5 km", "10km" → 1500, 10000 ; un nombre seul < 50 = des km
export function lireDistance(texte) {
  const resultat = texte
    .trim()
    .toLowerCase()
    .replace(',', '.')
    .match(/^(\d+(?:\.\d+)?)\s*(km|m)?$/);
  if (!resultat) return null;
  const nombre = Number(resultat[1]);
  const unite = resultat[2] ?? (nombre < 50 ? 'km' : 'm');
  return Math.round(unite === 'km' ? nombre * 1000 : nombre);
}

export function formaterMesure(bloc) {
  return bloc.mesure === 'duree' ? formaterChrono(bloc.valeur) : formaterDistance(bloc.valeur);
}

// { type: 'allure', min: 260, max: 270 } → "4:20 – 4:30 /km"
export function formaterCible(cible) {
  if (!cible || cible.type === 'aucune') return '';
  const fourchette = (f) => (cible.max ? `${f(cible.min)} – ${f(cible.max)}` : f(cible.min));
  if (cible.type === 'allure') return `${fourchette(formaterChrono)} /km`;
  if (cible.type === 'puissance') return `${fourchette(String)} W`;
  return cible.max ? `Z${cible.min} – Z${cible.max}` : `Z${cible.min}`;
}

// ----- Totaux -----

// Durée (s) et distance (m) totales. Quand une valeur ne peut pas être calculée
// (ex. 1000 m sans allure), le total correspondant est marqué incomplet.
export function totaux(blocs) {
  let duree = 0;
  let distance = 0;
  let dureeComplete = true;
  let distanceComplete = true;

  for (const bloc of blocs) {
    if (bloc.type === 'repetition') {
      const sous = totaux(bloc.blocs);
      duree += sous.duree * bloc.repetitions;
      distance += sous.distance * bloc.repetitions;
      dureeComplete &&= sous.dureeComplete;
      distanceComplete &&= sous.distanceComplete;
      continue;
    }
    // Allure moyenne de la fourchette, en secondes par km
    const allure =
      bloc.cible?.type === 'allure'
        ? (bloc.cible.min + (bloc.cible.max ?? bloc.cible.min)) / 2
        : null;
    if (bloc.mesure === 'duree') {
      duree += bloc.valeur;
      if (allure) distance += (bloc.valeur / allure) * 1000;
      else distanceComplete = false;
    } else {
      distance += bloc.valeur;
      if (allure) duree += (bloc.valeur / 1000) * allure;
      else dureeComplete = false;
    }
  }
  return { duree, distance, dureeComplete, distanceComplete };
}

// Texte du récapitulatif, ex. "≈ 58 min · 11,2 km"
export function resumerTotaux(blocs) {
  const t = totaux(blocs);
  const morceaux = [];
  if (t.duree > 0) morceaux.push(`${t.dureeComplete ? '' : '≥ '}${Math.round(t.duree / 60)} min`);
  if (t.distance > 0)
    morceaux.push(`${t.distanceComplete ? '' : '≥ '}${formaterDistance(t.distance)}`);
  return morceaux.join(' · ');
}
