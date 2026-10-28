import { useEffect, useState } from 'react';
import { api } from './api.js';

const INTERVALLE_MS = 15000;
const EVENEMENT = 'notifications-maj';

// À appeler après une action qui change les compteurs (message lu, demande acceptée…)
// pour que l'en-tête se mette à jour tout de suite, sans attendre l'intervalle.
export function signalerChangement() {
  window.dispatchEvent(new Event(EVENEMENT));
}

// Hook qui interroge GET /api/notifications toutes les 15 secondes pour l'utilisateur connecté.
// Renvoie { messagesNonLus, parAthlete, demandesEnAttente } ou null.
export function useNotifications(userId) {
  const [etat, setEtat] = useState({ userId: null, notifs: null });

  useEffect(() => {
    if (!userId) return;
    let annule = false;
    const charger = () => {
      if (document.hidden) return; // onglet en arrière-plan : inutile d'interroger le serveur
      api('notifications')
        .then((notifs) => !annule && setEtat({ userId, notifs }))
        .catch(() => {}); // un échec ponctuel n'est pas grave, on réessaiera
    };
    charger();
    const minuterie = setInterval(charger, INTERVALLE_MS);
    window.addEventListener(EVENEMENT, charger);
    return () => {
      annule = true;
      clearInterval(minuterie);
      window.removeEventListener(EVENEMENT, charger);
    };
  }, [userId]);

  // Ignore les compteurs d'un utilisateur précédent (après une déconnexion)
  return etat.userId === userId ? etat.notifs : null;
}
