import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { ajouterJours } from './dates.js';

// Hook qui charge les séances d'une semaine (lundi → dimanche).
// athleteId est obligatoire pour un coach, ignoré pour un athlète.
export function useSeancesSemaine(lundi, athleteId) {
  const [version, setVersion] = useState(0);
  // "cle" identifie la demande à laquelle correspond le résultat affiché
  const cle = `${lundi}|${athleteId ?? ''}|${version}`;
  const [etat, setEtat] = useState({ cle: null, seances: [], error: '' });

  useEffect(() => {
    let annule = false;
    const params = new URLSearchParams({ from: lundi, to: ajouterJours(lundi, 6) });
    if (athleteId) params.set('athleteId', athleteId);

    api(`seances?${params}`)
      .then((seances) => !annule && setEtat({ cle, seances, error: '' }))
      .catch((err) => !annule && setEtat({ cle, seances: [], error: err.message }));
    // Si la semaine change avant la réponse, on ignore l'ancienne réponse
    return () => {
      annule = true;
    };
  }, [cle, lundi, athleteId]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  // Remplace une séance dans la liste après une modification (sans tout recharger)
  const remplacerSeance = useCallback((seance) => {
    setEtat((e) => ({ ...e, seances: e.seances.map((s) => (s.id === seance.id ? seance : s)) }));
  }, []);

  return {
    seances: etat.seances,
    error: etat.error,
    // Chargement en cours tant que le résultat ne correspond pas à la demande actuelle
    loading: etat.cle !== cle,
    recharger,
    remplacerSeance,
  };
}
