import { useState } from 'react';
import { SPORTS, adapterAuSport, resumerTotaux, totaux } from '../blocs.js';
import { TYPES_SEANCE } from '../libelles.js';
import BlocsEditor from './BlocsEditor.jsx';
import { ErrorMessage } from './Feedback.jsx';

const SPORTS_CONNUS = SPORTS.map((s) => s.value);

// Formulaire de création / modification d'une séance (coach), avec sa structure en blocs.
// - avecDate = false pour une séance type de la bibliothèque (sans date)
// - onSubmit reçoit les valeurs et renvoie une promesse ; une erreur est affichée dans le formulaire.
export default function SeanceForm({ initial, onSubmit, onCancel, avecDate = true }) {
  const [valeurs, setValeurs] = useState({
    date: initial.date ?? '',
    titre: initial.titre ?? '',
    // Les anciennes séances avaient un sport en texte libre : on les range dans "Autre"
    sport: SPORTS_CONNUS.includes(initial.sport)
      ? initial.sport
      : initial.sport
        ? 'autre'
        : 'course',
    type: initial.type ?? 'endurance',
    dureePrevueMin: initial.dureePrevueMin ?? '',
    description: initial.description ?? '',
    blocs: initial.blocs ?? [],
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });
  const changerSport = (e) => {
    const sport = e.target.value;
    setValeurs({ ...valeurs, sport, blocs: adapterAuSport(valeurs.blocs, sport) });
  };

  // Si les blocs permettent de calculer la durée, elle est remplie automatiquement
  const t = totaux(valeurs.blocs);
  const dureeAuto = valeurs.blocs.length > 0 && t.dureeComplete ? Math.round(t.duree / 60) : null;

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    const duree =
      dureeAuto ?? (valeurs.dureePrevueMin === '' ? null : Number(valeurs.dureePrevueMin));
    try {
      const { date, ...contenu } = valeurs;
      await onSubmit({ ...(avecDate ? { date } : {}), ...contenu, dureePrevueMin: duree });
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
        <input
          name="titre"
          value={valeurs.titre}
          onChange={changer}
          required
          maxLength={100}
          placeholder="ex. 6 × 1000 m"
        />
      </label>
      <div className="form-ligne form-ligne-3">
        {avecDate && (
          <label>
            Date
            <input type="date" name="date" value={valeurs.date} onChange={changer} required />
          </label>
        )}
        <label>
          Sport
          <select name="sport" value={valeurs.sport} onChange={changerSport}>
            {SPORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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

      <fieldset className="structure">
        <legend>Structure de la séance</legend>
        <BlocsEditor
          blocs={valeurs.blocs}
          sport={valeurs.sport}
          onChange={(blocs) => setValeurs({ ...valeurs, blocs })}
        />
        {valeurs.blocs.length > 0 && (
          <p className="structure-total">
            Total : <strong>{resumerTotaux(valeurs.blocs)}</strong>
            {!t.dureeComplete && (
              <span className="texte-discret">
                {' '}
                (« ≥ » : une distance sans allure ne permet pas de calculer la durée)
              </span>
            )}
          </p>
        )}
      </fieldset>

      <label>
        Durée prévue (min)
        <input
          type="number"
          name="dureePrevueMin"
          value={dureeAuto ?? valeurs.dureePrevueMin}
          onChange={changer}
          min={0}
          max={1440}
          disabled={dureeAuto !== null}
        />
        {dureeAuto !== null && <span className="texte-discret">Calculée à partir des blocs.</span>}
      </label>
      <label>
        Consignes
        <textarea
          name="description"
          value={valeurs.description}
          onChange={changer}
          rows={3}
          maxLength={2000}
          placeholder="Objectif de la séance, terrain, conseils…"
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
