// Calculs sur les blocs d'une séance, partagés entre le serveur et React.
// React l'importe depuis src/blocs.js. Ce fichier est rangé dans server/ car le
// Dockerfile de production ne copie que ce dossier : le serveur doit pouvoir l'utiliser.
// Il ne contient que des fonctions "pures" (pas de base de données, pas de navigateur).

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
  return { duree, distance, dplus, dureeComplete, distanceComplete };
}
