import { useEffect, useState } from 'react';
import { api } from '../api.js';
import SeanceForm from './SeanceForm.jsx';

// Création d'une séance, vide ou à partir d'un modèle de la bibliothèque du coach.
export default function NouvelleSeance({ date, onSubmit, onCancel }) {
  const [modeles, setModeles] = useState([]);
  const [modeleId, setModeleId] = useState('');

  useEffect(() => {
    api('seances-types')
      .then(setModeles)
      .catch(() => setModeles([])); // sans bibliothèque, on peut quand même créer une séance
  }, []);

  const modele = modeles.find((m) => String(m.id) === modeleId);

  return (
    <>
      {modeles.length > 0 && (
        <label className="choix-modele">
          Partir d’un modèle de ma bibliothèque
          <select value={modeleId} onChange={(e) => setModeleId(e.target.value)}>
            <option value="">— Séance vide —</option>
            {modeles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titre}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* key : le formulaire est recréé (et pré-rempli) quand on change de modèle */}
      <SeanceForm
        key={modeleId}
        initial={{ ...modele, date }}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </>
  );
}
