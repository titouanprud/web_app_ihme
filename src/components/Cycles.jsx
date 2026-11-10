import { useState } from 'react';
import { additionnerTotaux } from '../calendrier.js';
import { ajouterJours, debutSemaine, formaterDate, parseISODate } from '../dates.js';
import { COULEURS_CYCLE, libelleTypeCycle, TYPES_CYCLE } from '../libelles.js';
import { useApi } from '../useApi.js';
import { ErrorMessage, Loading } from './Feedback.jsx';
import Totaux from './Totaux.jsx';

// Cycles d'entraînement : bandeau dans le calendrier, détail, formulaire du coach.

// Cycle qui couvre une date (au plus un : les cycles d'un athlète ne se chevauchent pas)
export function cycleDuJour(cycles, jour) {
  return cycles.find((c) => c.dateDebut <= jour && c.dateFin >= jour);
}

const dateCourte = (iso) => formaterDate(iso, { day: 'numeric', month: 'short', year: 'numeric' });

// Bandeau coloré du cycle, avec son nom ; un clic ouvre le détail
export function BandeauCycle({ cycle, onOuvrir }) {
  return (
    <button
      type="button"
      className="bandeau-cycle"
      style={{ '--cycle': cycle.couleur }}
      onClick={() => onOuvrir(cycle)}
      title={`${cycle.nom} · ${libelleTypeCycle(cycle.type)} · cliquer pour le détail`}
      aria-label={`Cycle ${cycle.nom}`}
    >
      <strong>{cycle.nom}</strong>
      <span>
        {libelleTypeCycle(cycle.type)} · {dateCourte(cycle.dateDebut)} → {dateCourte(cycle.dateFin)}
      </span>
    </button>
  );
}

// Détail d'un cycle : objectif et totaux du prévu (mêmes totaux que le calendrier)
export function CycleDetails({ cycle, athleteId }) {
  const pour = athleteId ? `&athleteId=${athleteId}` : '';
  const { data, error } = useApi(
    `seances/totaux?groupe=mois&from=${cycle.dateDebut}&to=${cycle.dateFin}${pour}`,
  );
  const semaines =
    (parseISODate(cycle.dateFin) - parseISODate(cycle.dateDebut) + 86400000) / (7 * 86400000);

  return (
    <div className="details">
      <p className="texte-discret">
        {libelleTypeCycle(cycle.type)} · du {formaterDate(cycle.dateDebut)} au{' '}
        {formaterDate(cycle.dateFin)} ({Math.round(semaines)} semaines)
      </p>
      {cycle.objectif ? (
        <p className="details-description">{cycle.objectif}</p>
      ) : (
        <p className="texte-discret">Pas d’objectif précisé.</p>
      )}
      <h3>Totaux du cycle (prévu)</h3>
      <ErrorMessage message={error} />
      {!data && !error && <Loading />}
      {data && <Totaux t={additionnerTotaux(data)} />}
    </div>
  );
}

// Formulaire du coach. Les dates choisies sont ramenées au lundi (début) et au dimanche (fin).
export function CycleForm({ initial = {}, dateParDefaut, onSubmit, onCancel }) {
  const lundi = debutSemaine(parseISODate(initial.dateDebut ?? dateParDefaut));
  const [valeurs, setValeurs] = useState({
    nom: initial.nom ?? '',
    type: initial.type ?? 'preparation_generale',
    dateDebut: lundi,
    dateFin: initial.dateFin ?? ajouterJours(lundi, 4 * 7 - 1),
    objectif: initial.objectif ?? '',
    couleur: initial.couleur ?? COULEURS_CYCLE[0],
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });
  // Lundi de la semaine choisie / dimanche de la semaine choisie
  const changerDebut = (e) =>
    e.target.value &&
    setValeurs({ ...valeurs, dateDebut: debutSemaine(parseISODate(e.target.value)) });
  const changerFin = (e) =>
    e.target.value &&
    setValeurs({
      ...valeurs,
      dateFin: ajouterJours(debutSemaine(parseISODate(e.target.value)), 6),
    });

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await onSubmit(valeurs);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <ErrorMessage message={erreur} />
      <label>
        Nom
        <input
          name="nom"
          value={valeurs.nom}
          onChange={changer}
          required
          maxLength={100}
          placeholder="ex. Prépa marathon de printemps"
        />
      </label>
      <div className="form-ligne form-ligne-3">
        <label>
          Type
          <select name="type" value={valeurs.type} onChange={changer}>
            {TYPES_CYCLE.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Début (lundi)
          <input type="date" value={valeurs.dateDebut} onChange={changerDebut} required />
        </label>
        <label>
          Fin (dimanche)
          <input type="date" value={valeurs.dateFin} onChange={changerFin} required />
        </label>
      </div>
      <fieldset className="choix-couleur">
        <legend>Couleur</legend>
        {COULEURS_CYCLE.map((couleur) => (
          <label key={couleur} className="pastille-couleur" style={{ '--cycle': couleur }}>
            <input
              type="radio"
              name="couleur"
              value={couleur}
              checked={valeurs.couleur === couleur}
              onChange={changer}
            />
            <span className="sr-only">{couleur}</span>
          </label>
        ))}
      </fieldset>
      <label>
        Objectif
        <textarea
          name="objectif"
          value={valeurs.objectif}
          onChange={changer}
          rows={3}
          maxLength={2000}
          placeholder="ex. Développer l’endurance, monter progressivement le volume"
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
