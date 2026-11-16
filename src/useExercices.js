import { useEffect, useState } from 'react';
import { api } from './api.js';

// Base d'exercices de renforcement (base commune + exercices du coach), proposée dans
// l'éditeur de séance. La liste est chargée une seule fois puis gardée en mémoire :
// tous les exercices d'une séance partagent le même chargement.
let enMemoire = null;
let chargement = null;
const abonnes = new Set();

function publier(liste) {
  enMemoire = liste;
  abonnes.forEach((f) => f(liste));
}

export const CATEGORIES_EXERCICE = [
  { value: 'jambes', label: 'Jambes' },
  { value: 'haut_du_corps', label: 'Haut du corps' },
  { value: 'gainage', label: 'Gainage' },
  { value: 'pliometrie', label: 'Pliométrie' },
  { value: 'mobilite', label: 'Mobilité' },
];

export function useExercices() {
  const [exercices, setExercices] = useState(enMemoire);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    abonnes.add(setExercices);
    if (!enMemoire) {
      chargement ??= api('exercices').finally(() => {
        chargement = null;
      });
      chargement.then(publier).catch((err) => setErreur(err.message));
    }
    return () => abonnes.delete(setExercices);
  }, []);

  // Ajoute un exercice à la base du coach ; renvoie l'exercice créé
  async function ajouter(nom, categorie) {
    const exercice = await api('exercices', { method: 'POST', body: { nom, categorie } });
    publier([...(enMemoire ?? []), exercice]);
    return exercice;
  }

  return { exercices, erreur, ajouter };
}

// À la connexion / déconnexion (auth.jsx) : un autre coach ne doit pas voir la base du précédent
export function oublierExercices() {
  enMemoire = null;
}
