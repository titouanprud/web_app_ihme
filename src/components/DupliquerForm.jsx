import { useState } from 'react';
import { ErrorMessage } from './Feedback.jsx';

// Choix de la date et de l'athlète pour dupliquer une séance.
export default function DupliquerForm({ seance, athletes, onSubmit, onCancel }) {
  const [date, setDate] = useState(seance.date);
  const [athleteId, setAthleteId] = useState(String(seance.athleteId));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await onSubmit({ date, athleteId: Number(athleteId) });
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <p className="texte-discret">
        Une copie de « {seance.titre} » (avec ses blocs) sera créée au statut « Prévue ».
      </p>
      <ErrorMessage message={erreur} />
      <div className="form-ligne">
        <label>
          Nouvelle date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Pour l’athlète
          <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.prenom} {a.nom}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Copie…' : 'Dupliquer'}
        </button>
      </div>
    </form>
  );
}
