// Calculs sur les blocs d'une séance, partagés entre le serveur et React.
// React l'importe depuis src/blocs.js. Ce fichier est rangé dans server/ car le
// Dockerfile de production ne copie que ce dossier : le serveur doit pouvoir l'utiliser.
// Il ne contient que des fonctions "pures" (pas de base de données, pas de navigateur).

// ----- Allures de référence (@5k, @10k, @21k, @42k, @SV1, @SV2) -----

export const REFERENCES = ['5k', '10k', '21k', '42k', 'sv1', 'sv2'];

// Record du profil utilisé pour chaque référence, et sa distance en km
const RECORD_DE_REFERENCE = {
  '5k': { distance: '5k', km: 5 },
  '10k': { distance: '10k', km: 10 },
  '21k': { distance: 'semi', km: 21.0975 },
  '42k': { distance: 'marathon', km: 42.195 },
};

// Allure (secondes par km) d'une référence, calculée depuis le profil de l'athlète
// { records: [{ distance, tempsSec }], seuils: { sv1Allure, sv2Allure } }.
// Renvoie null si le profil ne contient pas la valeur.
export function allureDeReference(ref, profil) {
  if (ref === 'sv1') return profil?.seuils?.sv1Allure ?? null;
  if (ref === 'sv2') return profil?.seuils?.sv2Allure ?? null;
  const { distance, km } = RECORD_DE_REFERENCE[ref];
  const record = profil?.records?.find((r) => r.distance === distance);
  // Allure = temps ÷ distance, ex. 10 km en 42:00 → 2520 s ÷ 10 = 252 s/km (4:12 /km)
  return record ? Math.round(record.tempsSec / km) : null;
}

// Applique une fonction à chaque bloc simple, y compris dans les répétitions
function transformerBlocs(blocs, fonction) {
  return blocs.map((bloc) =>
    bloc.type === 'repetition' ? { ...bloc, blocs: bloc.blocs.map(fonction) } : fonction(bloc),
  );
}

// Les références sans allure (ex. un modèle du catalogue) reçoivent l'allure du profil.
// Les allures déjà présentes (copiées ou modifiées par le coach) ne changent pas.
export function resoudreReferences(blocs, profil) {
  return transformerBlocs(blocs, (bloc) => {
    const cible = bloc.cible;
    if (cible?.type !== 'reference' || cible.allure_sec) return bloc;
    return {
      ...bloc,
      cible: { ...cible, allure_sec: allureDeReference(cible.ref, profil), modifiee: false },
    };
  });
}

// Pour un modèle : on garde la référence (@10k) mais pas l'allure, propre à chaque athlète
export function retirerAllures(blocs) {
  return transformerBlocs(blocs, (bloc) =>
    bloc.cible?.type === 'reference'
      ? { ...bloc, cible: { ...bloc.cible, allure_sec: null, modifiee: false } }
      : bloc,
  );
}

// Références dont l'allure manque encore, ex. ['10k', 'sv2']
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
  if (cible?.type === 'reference') return cible.allure_sec ?? null;
  return null;
}

// Durée (s) et distance (m) d'un bloc simple. Avec une allure, on calcule la valeur
// manquante : distance = durée ÷ allure, durée = distance × allure.
// Sans allure, la valeur inconnue vaut null.
export function estimerBloc(bloc) {
  const allure = allureDuBloc(bloc);
  if (bloc.mesure === 'duree') {
    return { duree: bloc.valeur, distance: allure ? (bloc.valeur / allure) * 1000 : null };
  }
  return { duree: allure ? (bloc.valeur / 1000) * allure : null, distance: bloc.valeur };
}

// Durée (s), distance (m) et D+ (m) totaux d'une liste de blocs, répétitions comprises.
// Quand une valeur ne peut pas être calculée (ex. 1000 m sans allure), le total
// correspondant est marqué incomplet (dureeComplete / distanceComplete à false).
export function estimerBlocs(blocs) {
  let duree = 0;
  let distance = 0;
  let dplus = 0;
  let dureeComplete = true;
  let distanceComplete = true;

  for (const bloc of blocs) {
    if (bloc.type === 'repetition') {
      const sous = estimerBlocs(bloc.blocs);
      duree += sous.duree * bloc.repetitions;
      distance += sous.distance * bloc.repetitions;
      dplus += sous.dplus * bloc.repetitions;
      dureeComplete &&= sous.dureeComplete;
      distanceComplete &&= sous.distanceComplete;
      continue;
    }
    dplus += bloc.dplus ?? 0;
    const estime = estimerBloc(bloc);
    if (estime.duree === null) dureeComplete = false;
    else duree += estime.duree;
    if (estime.distance === null) distanceComplete = false;
    else distance += estime.distance;
  }
  return { duree, distance, dplus, dureeComplete, distanceComplete };
}

// Durée (s) et distance (m) enregistrées avec la séance, pour les totaux du calendrier :
// - durée : celle des blocs si elle est complète, sinon la durée prévue saisie,
//   sinon ce que les blocs permettent de calculer ;
// - distance : celle des blocs (0 si aucun bloc n'a de distance ni d'allure).
export function estimerSeance(blocs, dureePrevueMin) {
  const t = estimerBlocs(blocs);
  let duree = t.duree;
  if (
    !(t.dureeComplete && t.duree > 0) &&
    dureePrevueMin !== null &&
    dureePrevueMin !== undefined
  ) {
    duree = dureePrevueMin * 60;
  }
  return { dureeSec: Math.round(duree), distanceM: Math.round(t.distance) };
}
