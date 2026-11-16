import { useState } from 'react';
import {
  SPORT_EXERCICES,
  SPORTS,
  SPORTS_AVEC_DPLUS,
  adapterAuSport,
  compterBlocs,
  resoudreReferences,
  resumerTotaux,
  totaux,
} from '../blocs.js';
import { TYPES_SEANCE } from '../libelles.js';
import BlocsEditor from './BlocsEditor.jsx';
import { ErrorMessage } from './Feedback.jsx';

const SPORTS_CONNUS = SPORTS.map((s) => s.value);

// Formulaire de création / modification d'une séance (coach), avec sa structure en blocs.
// - avecDate = false pour une séance type de la bibliothèque (sans date) : c'est un modèle,
//   ses allures de référence (@10k…) sont gardées sans valeur
// - profil : profil de l'athlète, pour calculer les allures de référence
// - onSubmit reçoit les valeurs et renvoie une promesse ; une erreur est affichée dans le formulaire.
export default function SeanceForm({
  initial,
  onSubmit,
  onCancel,
  avecDate = true,
  profil = null,
}) {
  const modele = !avecDate;
  // Les anciennes séances avaient un sport en texte libre : on les range dans "Autre"
  const sportInitial = SPORTS_CONNUS.includes(initial.sport)
    ? initial.sport
    : initial.sport
      ? 'autre'
      : 'course';
  // Les blocs sont adaptés au sport : une ancienne séance de renfo (échauffement,
  // intervalles…) perd ces blocs, remplacés par des exercices. On prévient le coach.
  const blocsInitiaux = adapterAuSport(initial.blocs ?? [], sportInitial);
  const blocsRetires = compterBlocs(initial.blocs ?? []) - compterBlocs(blocsInitiaux);
  const [valeurs, setValeurs] = useState({
    date: initial.date ?? '',
    titre: initial.titre ?? '',
    sport: sportInitial,
    type: initial.type ?? (sportInitial === SPORT_EXERCICES ? 'renfo' : 'endurance'),
    dureePrevueMin: initial.dureePrevueMin ?? '',
    dplusPrevuM: initial.dplusPrevuM ?? '',
    description: initial.description ?? '',
    // Séance créée depuis un modèle : les références et les zones reçoivent l'allure du profil
    blocs: modele ? blocsInitiaux : resoudreReferences(blocsInitiaux, profil, sportInitial),
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });
  const changerSport = (e) => {
    const sport = e.target.value;
    const blocs = adapterAuSport(valeurs.blocs, sport);
    setValeurs({
      ...valeurs,
      sport,
      blocs: modele ? blocs : resoudreReferences(blocs, profil, sport),
      ...(sport === SPORT_EXERCICES && { type: 'renfo' }),
    });
  };

  // Si les blocs permettent de calculer la durée exacte, elle est remplie automatiquement.
  // En renfo, la durée des exercices n'est qu'une estimation : le coach garde la main.
  const options = { sport: valeurs.sport, profil: modele ? null : profil };
  const t = totaux(valeurs.blocs, options);
  const dureeAuto = valeurs.blocs.length > 0 && t.dureeComplete ? Math.round(t.duree / 60) : null;
  // Même principe pour le D+ : somme des blocs, sinon saisie directe
  const avecDplus = SPORTS_AVEC_DPLUS.includes(valeurs.sport);
  const dplusAuto = t.dplus > 0 ? t.dplus : null;

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    const nombre = (v) => (v === '' ? null : Number(v));
    const duree = dureeAuto ?? nombre(valeurs.dureePrevueMin);
    const dplus = avecDplus ? (dplusAuto ?? nombre(valeurs.dplusPrevuM)) : null;
    try {
      const { date, ...contenu } = valeurs;
      await onSubmit({
        ...(avecDate ? { date } : {}),
        ...contenu,
        dureePrevueMin: duree,
        dplusPrevuM: dplus,
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
        {blocsRetires > 0 && (
          <p className="texte-discret">
            {blocsRetires} ancien(s) bloc(s) ne correspondent pas à ce sport (en renforcement, la
            séance se compose d’exercices) : ils seront retirés à l’enregistrement.
          </p>
        )}
        <BlocsEditor
          blocs={valeurs.blocs}
          sport={valeurs.sport}
          onChange={(blocs) => setValeurs({ ...valeurs, blocs })}
          profil={profil}
          modele={modele}
        />
        {valeurs.blocs.length > 0 && (
          <p className="structure-total">
            Total : <strong>{resumerTotaux(valeurs.blocs, options)}</strong>
            {(!t.dureeComplete || !t.distanceComplete) && (
              <span className="texte-discret">
                {' '}
                (« ≈ » : valeur indicative, calculée sans allure précise
                {valeurs.sport === SPORT_EXERCICES
                  ? ' : environ 4 s par répétition, plus les repos'
                  : ' : zone 2 du profil, SV1 ou 6:00 /km en course, 25 km/h à vélo'}
                )
              </span>
            )}
          </p>
        )}
      </fieldset>

      <div className="form-ligne">
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
            placeholder={
              dureeAuto === null && t.duree > 0 ? `≈ ${Math.round(t.duree / 60)}` : undefined
            }
          />
          {dureeAuto !== null && (
            <span className="texte-discret">Calculée à partir des blocs.</span>
          )}
        </label>
        {avecDplus && (
          <label>
            D+ prévu (m)
            <input
              type="number"
              name="dplusPrevuM"
              value={dplusAuto ?? valeurs.dplusPrevuM}
              onChange={changer}
              min={0}
              max={20000}
              disabled={dplusAuto !== null}
            />
            {dplusAuto !== null && <span className="texte-discret">Somme des D+ des blocs.</span>}
          </label>
        )}
      </div>
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
