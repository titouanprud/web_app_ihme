import { useEffect, useState } from 'react';
import { api } from './api.js';

// Hook qui charge GET /api/<chemin> et recharge quand le chemin ou "version" change.
// - chemin = null : rien à charger ;
// - pendant un rechargement, les données précédentes restent affichées (loading = true).
export function useApi(chemin, version = 0) {
  // "cle" identifie la demande à laquelle correspond le résultat affiché
  const cle = `${chemin}|${version}`;
  const [etat, setEtat] = useState({ cle: null, data: null, error: '' });

  useEffect(() => {
    if (!chemin) return;
    let annule = false;
    api(chemin)
      .then((data) => !annule && setEtat({ cle, data, error: '' }))
      .catch((err) => !annule && setEtat({ cle, data: null, error: err.message }));
    // Si la demande change avant la réponse, on ignore l'ancienne réponse
    return () => {
      annule = true;
    };
  }, [cle, chemin]);

  return { data: etat.data, error: etat.error, loading: chemin !== null && etat.cle !== cle };
}
