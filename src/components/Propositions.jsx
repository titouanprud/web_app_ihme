import { useState } from 'react';
import { SPORTS_AVEC_DPLUS, formaterDplus, totaux } from '../blocs.js';
import { formaterDate } from '../dates.js';
import BlocsAffichage from './BlocsAffichage.jsx';
import BlocsEditor from './BlocsEditor.jsx';
import { ErrorMessage } from './Feedback.jsx';

// Propositions de modification d'une séance par l'athlète.

const LIBELLES_CHAMPS = {
  date: 'Date',
  titre: 'Titre',
  description: 'Consignes',
  blocs: 'Structure',
  dplusPrevuM: 'D+',
};

export const STATUTS_PROPOSITION = {
  en_attente: 'En attente du coach',
  acceptee: 'Acceptée',
  refusee: 'Refusée',
};

// Affichage d'une valeur d'un champ (avant ou après)
function Valeur({ champ, valeur }) {
  if (champ === 'date') return formaterDate(valeur);
  if (champ === 'blocs') {
    return valeur?.length ? <BlocsAffichage blocs={valeur} /> : <em>Aucun bloc</em>;
  }
  if (champ === 'dplusPrevuM') return valeur ? formaterDplus(valeur) : '—';
  return valeur || <em>vide</em>;
}

// Comparaison avant / après, uniquement pour les champs modifiés
export function Comparaison({ seance, changements }) {
  return (
    <div className="comparaison">
      {Object.entries(changements).map(([champ, apres]) => (
        <div key={champ} className="comparaison-ligne">
          <strong className="comparaison-champ">{LIBELLES_CHAMPS[champ]}</strong>
          <div className="comparaison-avant">
            <span className="texte-discret">Avant</span>
            <Valeur champ={champ} valeur={seance[champ]} />
          </div>
          <div className="comparaison-apres">
            <span className="texte-discret">Proposé</span>
            <Valeur champ={champ} valeur={apres} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Formulaire de l'athlète : date, titre, consignes, structure et D+.
// Le serveur ne garde que les champs réellement modifiés.
export function PropositionForm({ seance, profil, onSubmit, onCancel }) {
  const [valeurs, setValeurs] = useState({
    date: seance.date,
    titre: seance.titre,
    description: seance.description,
    blocs: seance.blocs,
    dplusPrevuM: seance.dplusPrevuM ?? '',
    message: '',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });

  const avecDplus = SPORTS_AVEC_DPLUS.includes(seance.sport);
  const dplusBlocs = totaux(valeurs.blocs).dplus;

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    const { message, ...changements } = valeurs;
    if (avecDplus) {
      changements.dplusPrevuM =
        changements.dplusPrevuM === '' ? null : Number(changements.dplusPrevuM);
    } else {
      delete changements.dplusPrevuM;
    }
    try {
      await onSubmit({ changements, message });
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <p className="texte-discret">
        La séance ne changera que si votre coach accepte votre proposition.
      </p>
      <ErrorMessage message={erreur} />
      <div className="form-ligne">
        <label>
          Date
          <input type="date" name="date" value={valeurs.date} onChange={changer} required />
        </label>
        <label>
          Titre
          <input name="titre" value={valeurs.titre} onChange={changer} required maxLength={100} />
        </label>
      </div>
      <fieldset className="structure">
        <legend>Structure de la séance</legend>
        <BlocsEditor
          blocs={valeurs.blocs}
          sport={seance.sport}
          onChange={(blocs) => setValeurs({ ...valeurs, blocs })}
          profil={profil}
        />
      </fieldset>
      {avecDplus && (
        <label>
          D+ prévu (m)
          <input
            type="number"
            name="dplusPrevuM"
            min={0}
            max={20000}
            value={dplusBlocs > 0 ? dplusBlocs : valeurs.dplusPrevuM}
            onChange={changer}
            disabled={dplusBlocs > 0}
          />
        </label>
      )}
      <label>
        Consignes
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          value={valeurs.description}
          onChange={changer}
        />
      </label>
      <label>
        Message pour votre coach
        <textarea
          name="message"
          rows={2}
          maxLength={1000}
          value={valeurs.message}
          onChange={changer}
          placeholder="ex. Je ne suis pas disponible mercredi"
        />
      </label>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Envoi…' : 'Envoyer la proposition'}
        </button>
      </div>
    </form>
  );
}

// Suivi de la dernière proposition, dans le détail de la séance (côté athlète)
export function SuiviProposition({ seance, onAnnuler }) {
  const p = seance.proposition;
  if (!p) return null;
  return (
    <div className={`suivi-proposition proposition-${p.statut}`}>
      <h3>
        Ma proposition : <span>{STATUTS_PROPOSITION[p.statut]}</span>
      </h3>
      {p.statut === 'en_attente' && (
        <>
          <Comparaison seance={seance} changements={p.changements} />
          <button type="button" className="btn btn-ghost btn-petit" onClick={onAnnuler}>
            Annuler ma proposition
          </button>
        </>
      )}
      {p.reponse && <p className="retour-commentaire">Coach : « {p.reponse} »</p>}
    </div>
  );
}
