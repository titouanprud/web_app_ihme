// Calculs sur les blocs d'une séance, partagés entre le serveur et React.
// React l'importe depuis src/blocs.js. Ce fichier est rangé dans server/ car le
// Dockerfile de production ne copie que ce dossier : le serveur doit pouvoir l'utiliser.
// Il ne contient que des fonctions "pures" (pas de base de données, pas de navigateur).
//
// Le profil de l'athlète a la forme :
// { records: [{ distance, tempsSec }], seuils: { sv1Allure, sv2Allure, … },
//   zones: [{ zone: 1 à 5, allureMin, allureMax, fcMin, fcMax }] }
// (allures en secondes par km : allureMin est la plus rapide de la zone).

// ----- Vitesse critique (modèle à deux points : records sur 1200 m et 3600 m) -----

// La vitesse critique (VC) est la pente de la droite distance = VC × temps + D'
// qui passe par les deux records : VC = (3600 − 1200) ÷ (t3600 − t1200).
// D' est la "réserve" de distance que l'on peut courir au-dessus de la VC.
// Renvoie { vitesseMs, kmh, allureSec, dPrimeM } ou null (record absent ou incohérent).
export function vitesseCritique(records) {
  const temps = (distance) => records?.find((r) => r.distance === distance)?.tempsSec;
  const t1200 = temps('1200m');
  const t3600 = temps('3600m');
  // Le 3600 m doit être couru moins vite que le 1200 m (t3600 > 3 × t1200)
  if (!t1200 || !t3600 || t3600 <= 3 * t1200) return null;
  const vitesseMs = 2400 / (t3600 - t1200);
  return {
    vitesseMs,
    kmh: Math.round(vitesseMs * 3.6 * 10) / 10,
    allureSec: Math.round(1000 / vitesseMs),
    dPrimeM: Math.round(1200 - vitesseMs * t1200),
  };
}

// ----- Allures de référence (@5k, @10k, @21k, @42k, @SV1, @SV2, @VC) -----

export const REFERENCES = ['5k', '10k', '21k', '42k', 'sv1', 'sv2', 'vc'];

// Record du profil utilisé pour chaque référence, et sa distance en km
const RECORD_DE_REFERENCE = {
  '5k': { distance: '5k', km: 5 },
  '10k': { distance: '10k', km: 10 },
  '21k': { distance: 'semi', km: 21.0975 },
  '42k': { distance: 'marathon', km: 42.195 },
};

// Allure (secondes par km) d'une référence, calculée depuis le profil de l'athlète.
// Renvoie null si le profil ne contient pas la valeur.
export function allureDeReference(ref, profil) {
  if (ref === 'sv1') return profil?.seuils?.sv1Allure ?? null;
  if (ref === 'sv2') return profil?.seuils?.sv2Allure ?? null;
  if (ref === 'vc') return vitesseCritique(profil?.records)?.allureSec ?? null;
  const { distance, km } = RECORD_DE_REFERENCE[ref];
  const record = profil?.records?.find((r) => r.distance === distance);
  // Allure = temps ÷ distance, ex. 10 km en 42:00 → 2520 s ÷ 10 = 252 s/km (4:12 /km)
  return record ? Math.round(record.tempsSec / km) : null;
}

// ----- Zones 1 à 5 -----

// Allure "centrale" d'une zone du profil : milieu de ses deux bornes, ou la seule connue.
function allureCentrale(zone) {
  const bornes = [zone?.allureMin, zone?.allureMax].filter(Boolean);
  if (bornes.length === 0) return null;
  return bornes.reduce((a, b) => a + b, 0) / bornes.length;
}

// Allure (s/km) d'une cible en zone (ex. Z2, ou Z2 – Z3 : moyenne des deux zones),
// d'après le tableau des zones du profil. null si le profil ne la donne pas.
export function allureDeZone(min, max, profil) {
  const zones = profil?.zones ?? [];
  const allures = [min, max ?? min]
    .map((n) => allureCentrale(zones.find((z) => z.zone === n)))
    .filter((a) => a !== null);
  if (allures.length === 0) return null;
  return Math.round(allures.reduce((a, b) => a + b, 0) / allures.length);
}

// Zones proposées à partir des seuils SV1 / SV2 (le coach peut ensuite les modifier) :
// Z1 plus lent que SV1 + 10 %, Z2 de SV1 + 10 % à SV1, Z3 de SV1 à SV2,
// Z4 de SV2 à SV2 − 5 %, Z5 plus rapide. FC : Z1 < SV1 − 10, Z2 → SV1, Z3 → SV2, Z4 → SV2 + 5.
export function zonesDepuisSeuils(seuils) {
  const a1 = seuils?.sv1Allure ?? null;
  const a2 = seuils?.sv2Allure ?? null;
  const f1 = seuils?.sv1Fc ?? null;
  const f2 = seuils?.sv2Fc ?? null;
  const fois = (v, k) => (v === null ? null : Math.round(v * k));
  const plus = (v, n) => (v === null ? null : v + n);
  return [
    { zone: 1, allureMin: fois(a1, 1.1), allureMax: null, fcMin: null, fcMax: plus(f1, -10) },
    { zone: 2, allureMin: a1, allureMax: fois(a1, 1.1), fcMin: plus(f1, -10), fcMax: f1 },
    { zone: 3, allureMin: a2, allureMax: a1, fcMin: f1, fcMax: f2 },
    { zone: 4, allureMin: fois(a2, 0.95), allureMax: a2, fcMin: f2, fcMax: plus(f2, 5) },
    { zone: 5, allureMin: null, allureMax: fois(a2, 0.95), fcMin: plus(f2, 5), fcMax: null },
  ];
}

// ----- Allure indicative (pour toujours avoir une distance) -----

// Vitesse retenue à vélo quand on ne connaît pas l'allure : 25 km/h = 144 s/km
const ALLURE_VELO = 144;
// Footing par défaut en course à pied : 6:00 /km
const ALLURE_COURSE = 360;

// Allure (s/km) utilisée pour un bloc sans allure, afin d'estimer quand même sa distance.
// Course : allure de la zone 2 du profil, sinon SV1 + 10 %, sinon 6:00 /km. Vélo : 25 km/h.
// Les autres sports n'ont pas de distance (null).
export function allureIndicative(sport, profil) {
  if (sport === 'velo') return ALLURE_VELO;
  if (sport !== 'course') return null;
  const z2 = allureDeZone(2, null, profil);
  if (z2) return z2;
  const sv1 = profil?.seuils?.sv1Allure;
  return sv1 ? Math.round(sv1 * 1.1) : ALLURE_COURSE;
}

// Applique une fonction à chaque bloc simple, y compris dans les répétitions
function transformerBlocs(blocs, fonction) {
  return blocs.map((bloc) =>
    bloc.type === 'repetition' ? { ...bloc, blocs: bloc.blocs.map(fonction) } : fonction(bloc),
  );
}

// Complète les allures vides avec le profil de l'athlète :
// - références (@10k…) sans allure (ex. un modèle du catalogue) ;
// - en course à pied, cibles en zone : allure tirée du tableau des zones.
// Les allures déjà présentes (copiées ou modifiées par le coach) ne changent pas.
export function resoudreReferences(blocs, profil, sport = 'course') {
  return transformerBlocs(blocs, (bloc) => {
    const cible = bloc.cible;
    if (cible?.type === 'reference' && !cible.allure_sec) {
      return {
        ...bloc,
        cible: { ...cible, allure_sec: allureDeReference(cible.ref, profil), modifiee: false },
      };
    }
    if (cible?.type === 'zone' && sport === 'course' && !cible.allure_sec) {
      return {
        ...bloc,
        cible: { ...cible, allure_sec: allureDeZone(cible.min, cible.max, profil) },
      };
    }
    return bloc;
  });
}

// Pour un modèle : on garde la référence (@10k) ou la zone mais pas l'allure,
// propre à chaque athlète
export function retirerAllures(blocs) {
  return transformerBlocs(blocs, (bloc) => {
    if (bloc.cible?.type === 'reference') {
      return { ...bloc, cible: { ...bloc.cible, allure_sec: null, modifiee: false } };
    }
    if (bloc.cible?.type === 'zone' && bloc.cible.allure_sec !== undefined) {
      const cible = { ...bloc.cible };
      delete cible.allure_sec;
      return { ...bloc, cible };
    }
    return bloc;
  });
}

// Références dont l'allure manque encore, ex. ['10k', 'sv2'] (les zones ne sont pas obligatoires)
export function referencesSansAllure(blocs) {
  const manquantes = [];
  transformerBlocs(blocs, (bloc) => {
    const cible = bloc.cible;
    if (cible?.type === 'reference' && !cible.allure_sec && !manquantes.includes(cible.ref)) {
      manquantes.push(cible.ref);
    }
    return bloc;
  });
  return manquantes;
}

// ----- Estimation de la durée et de la distance -----

// Allure d'un bloc en secondes par km (milieu de la fourchette), ou null s'il n'en a pas
export function allureDuBloc(bloc) {
  const cible = bloc.cible;
  if (cible?.type === 'allure') return (cible.min + (cible.max ?? cible.min)) / 2;
  if (cible?.type === 'reference' || cible?.type === 'zone') return cible.allure_sec ?? null;
  return null;
}

// Durée indicative d'un exercice de renforcement :
// séries × (effort + repos), l'effort valant 4 s par répétition ou la durée saisie.
const SECONDES_PAR_REPETITION = 4;
export function dureeExercice(bloc) {
  const effort = bloc.duree_sec ?? (bloc.repetitions ?? 0) * SECONDES_PAR_REPETITION;
  return bloc.series * (effort + (bloc.repos_sec ?? 0));
}

// Durée (s) et distance (m) d'un bloc simple. Avec une allure, on calcule la valeur
// manquante : distance = durée ÷ allure, durée = distance × allure.
// allureDefaut (facultative) sert quand le bloc n'a pas d'allure : la valeur est alors
// "indicative". Sans allure du tout, la valeur inconnue vaut null.
export function estimerBloc(bloc, allureDefaut = null) {
  if (bloc.type === 'exercice') {
    return { duree: dureeExercice(bloc), distance: 0, dureeIndicative: true };
  }
  const propre = allureDuBloc(bloc);
  const allure = propre ?? allureDefaut;
  const indicative = propre === null && allure !== null;
  if (bloc.mesure === 'duree') {
    return {
      duree: bloc.valeur,
      distance: allure ? (bloc.valeur / allure) * 1000 : null,
      distanceIndicative: indicative,
    };
  }
  return {
    duree: allure ? (bloc.valeur / 1000) * allure : null,
    distance: bloc.valeur,
    dureeIndicative: indicative,
  };
}

// Durée (s), distance (m) et D+ (m) totaux d'une liste de blocs, répétitions comprises.
// - dureeComplete / distanceComplete : toutes les valeurs sont exactes (calculées avec
//   les allures des blocs) ;
// - dureeManque / distanceManque : une valeur n'a pas pu être calculée du tout
//   (le total est alors un minimum, affiché « ≥ ») ; sinon un total incomplet est
//   indicatif (allure par défaut, affiché « ≈ »).
export function estimerBlocs(blocs, { allureDefaut = null } = {}) {
  const t = {
    duree: 0,
    distance: 0,
    dplus: 0,
    dureeComplete: true,
    distanceComplete: true,
    dureeManque: false,
    distanceManque: false,
  };

  for (const bloc of blocs) {
    if (bloc.type === 'repetition') {
      const sous = estimerBlocs(bloc.blocs, { allureDefaut });
      t.duree += sous.duree * bloc.repetitions;
      t.distance += sous.distance * bloc.repetitions;
      t.dplus += sous.dplus * bloc.repetitions;
      for (const cle of ['dureeComplete', 'distanceComplete']) t[cle] &&= sous[cle];
      for (const cle of ['dureeManque', 'distanceManque']) t[cle] ||= sous[cle];
      continue;
    }
    t.dplus += bloc.dplus ?? 0;
    const e = estimerBloc(bloc, allureDefaut);
    if (e.duree === null) t.dureeManque = true;
    else t.duree += e.duree;
    if (e.distance === null) t.distanceManque = true;
    else t.distance += e.distance;
    if (e.duree === null || e.dureeIndicative) t.dureeComplete = false;
    if (e.distance === null || e.distanceIndicative) t.distanceComplete = false;
  }
  return t;
}

// Durée (s) et distance (m) enregistrées avec la séance, pour les totaux du calendrier :
// - durée : celle des blocs si elle est exacte, sinon la durée prévue saisie,
//   sinon ce que les blocs permettent d'estimer ;
// - distance : celle des blocs, complétée par l'allure indicative du sport ;
//   une séance sans bloc (ex. « footing 45 min ») a une distance indicative calculée
//   avec sa durée prévue.
export function estimerSeance(blocs, dureePrevueMin, allureDefaut = null) {
  const t = estimerBlocs(blocs, { allureDefaut });
  const prevue = dureePrevueMin ?? null;
  let duree = t.duree;
  if (!(t.dureeComplete && t.duree > 0) && prevue !== null) duree = prevue * 60;

  let distance = t.distance;
  if (blocs.length === 0 && prevue !== null && allureDefaut) {
    distance = ((prevue * 60) / allureDefaut) * 1000;
  }
  return { dureeSec: Math.round(duree), distanceM: Math.round(distance) };
}
