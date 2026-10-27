import { useState } from 'react';
import { ErrorMessage } from './Feedback.jsx';

// Formulaire de l'athlète : séance réalisée ou non, ressenti, durée réelle, commentaire.
export default function RetourForm({ seance, onSubmit }) {
  const precedent = seance.retour;
  const [valeurs, setValeurs] = useState({
    statut: seance.statut === 'non_realisee' ? 'non_realisee' : 'realisee',
    ressenti: precedent?.ressenti ?? 5,
    dureeReelleMin: precedent?.dureeReelleMin ?? seance.dureePrevueMin ?? '',
    commentaire: precedent?.commentaire ?? '',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });
  const realisee = valeurs.statut === 'realisee';

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      await onSubmit({
        statut: valeurs.statut,
        ressenti: realisee ? Number(valeurs.ressenti) : null,
        dureeReelleMin:
          realisee && valeurs.dureeReelleMin !== '' ? Number(valeurs.dureeReelleMin) : null,
        commentaire: valeurs.commentaire,
      });
      setSucces('Retour enregistré, merci !');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="form retour-form" onSubmit={envoyer}>
      <h3>{precedent ? 'Modifier mon retour' : 'Mon retour'}</h3>
      <ErrorMessage message={erreur} />
      {succes && (
        <p className="success" role="status">
          {succes}
        </p>
      )}

      <fieldset className="choix-statut">
        <legend>La séance est-elle faite ?</legend>
        <label className="radio">
          <input
            type="radio"
            name="statut"
            value="realisee"
            checked={realisee}
            onChange={changer}
          />
          Réalisée
        </label>
        <label className="radio">
          <input
            type="radio"
            name="statut"
            value="non_realisee"
            checked={!realisee}
            onChange={changer}
          />
          Non réalisée
        </label>
      </fieldset>

      {realisee && (
        <div className="form-ligne">
          <label>
            Ressenti : <strong>{valeurs.ressenti} / 10</strong>
            <input
              type="range"
              name="ressenti"
              min={1}
              max={10}
              value={valeurs.ressenti}
              onChange={changer}
            />
          </label>
          <label>
            Durée réelle (min)
            <input
              type="number"
              name="dureeReelleMin"
              min={0}
              max={1440}
              value={valeurs.dureeReelleMin}
              onChange={changer}
            />
          </label>
        </div>
      )}

      <label>
        Commentaire
        <textarea
          name="commentaire"
          rows={3}
          maxLength={2000}
          value={valeurs.commentaire}
          onChange={changer}
          placeholder={
            realisee ? 'Sensations, difficultés…' : 'Pourquoi la séance n’a pas été faite ?'
          }
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Envoi…' : 'Envoyer mon retour'}
        </button>
      </div>
    </form>
  );
}
