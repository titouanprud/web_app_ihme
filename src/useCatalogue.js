import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Hook du catalogue du coach (ses modèles de séances) : chargement, ajout, modification, retrait.
// Utilisé par la page Bibliothèque et par le panneau à gauche du calendrier.
export function useCatalogue() {
  const [modeles, setModeles] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('seances-types')
      .then(setModeles)
      .catch((err) => setErreur(err.message));
  }, [version]);

  // Après un « Ajouter au catalogue » fait ailleurs (depuis une séance)
  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  async function creer(valeurs) {
    const modele = await api('seances-types', { method: 'POST', body: valeurs });
    setModeles((liste) => [...liste, modele]);
    return modele;
  }

  async function modifier(id, valeurs) {
    const modele = await api(`seances-types/${id}`, { method: 'PUT', body: valeurs });
    setModeles((liste) => liste.map((m) => (m.id === modele.id ? modele : m)));
  }

  // Demande confirmation ; renvoie true si le modèle a été retiré
  async function supprimer(modele) {
    if (!window.confirm(`Retirer « ${modele.titre} » du catalogue ?`)) return false;
    try {
      await api(`seances-types/${modele.id}`, { method: 'DELETE' });
      setModeles((liste) => liste.filter((m) => m.id !== modele.id));
      return true;
    } catch (err) {
      setErreur(err.message);
      return false;
    }
  }

  return { modeles, erreur, creer, modifier, supprimer, recharger };
}
