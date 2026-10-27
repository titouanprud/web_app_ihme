import { useState } from 'react';
import { TYPES_SEANCE } from '../libelles.js';
import { ErrorMessage } from './Feedback.jsx';

// Formulaire de création / modification d'une séance (coach).
// onSubmit reçoit les valeurs et renvoie une promesse ; une erreur est affichée dans le formulaire.
export default function SeanceForm({ initial, onSubmit, onCancel }) {
  const [valeurs, setValeurs] = useState({
    date: initial.date,
    titre: initial.titre ?? '',
    sport: initial.sport ?? '',
    type: initial.type ?? 'endurance',
    dureePrevueMin: initial.dureePrevueMin ?? '',
    description: initial.description ?? '',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await onSubmit({
        ...valeurs,
        dureePrevueMin: valeurs.dureePrevueMin === '' ? null : Number(valeurs.dureePrevueMin),
      });
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <ErrorMessage message={erreur} />
      <label>
        Titre
        <input name="titre" value={valeurs.titre} onChange={changer} required maxLength={100} />
      </label>
      <div className="form-ligne">
        <label>
          Date
          <input type="date" name="date" value={valeurs.date} onChange={changer} required />
        </label>
        <label>
          Durée prévue (min)
          <input
            type="number"
            name="dureePrevueMin"
            value={valeurs.dureePrevueMin}
            onChange={changer}
            min={0}
            max={1440}
          />
        </label>
      </div>
      <div className="form-ligne">
        <label>
          Sport
          <input
            name="sport"
            value={valeurs.sport}
            onChange={changer}
            required
            maxLength={50}
            placeholder="Course, vélo, natation…"
          />
        </label>
        <label>
          Type
          <select name="type" value={valeurs.type} onChange={changer}>
            {TYPES_SEANCE.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          name="description"
          value={valeurs.description}
          onChange={changer}
          rows={4}
          maxLength={2000}
          placeholder="Échauffement, corps de séance, consignes…"
        />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
