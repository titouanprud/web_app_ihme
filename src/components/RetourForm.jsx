import { useState } from 'react';
import { ErrorMessage } from './Feedback.jsx';

// Curseur de 1 à 10 avec la valeur affichée et des repères aux extrémités
function Note({ libelle, name, valeur, onChange, mini, maxi }) {
  return (
    <label>
      {libelle} : <strong>{valeur} / 10</strong>
      <input type="range" name={name} min={1} max={10} value={valeur} onChange={onChange} />
      <span className="note-reperes texte-discret">
        <span>{mini}</span>
        <span>{maxi}</span>
      </span>
    </label>
  );
}

// Formulaire de l'athlète : séance réalisée ou non, difficulté, forme et commentaire.
export default function RetourForm({ seance, onSubmit }) {
  const precedent = seance.retour;
  const [valeurs, setValeurs] = useState({
    statut: seance.statut === 'non_realisee' ? 'non_realisee' : 'realisee',
    difficulte: precedent?.difficulte ?? 5,
    forme: precedent?.forme ?? 5,
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
        difficulte: realisee ? Number(valeurs.difficulte) : null,
        forme: realisee ? Number(valeurs.forme) : null,
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
          <Note
            libelle="Difficulté de la séance"
            name="difficulte"
            valeur={valeurs.difficulte}
            onChange={changer}
            mini="Très facile"
            maxi="Maximale"
          />
          <Note
            libelle="Ma forme"
            name="forme"
            valeur={valeurs.forme}
            onChange={changer}
            mini="Épuisé"
            maxi="Excellente"
          />
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
