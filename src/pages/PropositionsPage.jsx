import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { libelleSport } from '../blocs.js';
import { formaterDate } from '../dates.js';
import { signalerChangement } from '../notifications.js';
import { useApi } from '../useApi.js';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import { Comparaison, STATUTS_PROPOSITION } from '../components/Propositions.jsx';

// Propositions de modification envoyées par les athlètes : comparaison avant / après,
// puis acceptation (les changements sont appliqués à la séance) ou refus avec un message.
export default function PropositionsPage() {
  const [toutes, setToutes] = useState(false);
  const [version, setVersion] = useState(0);
  const { data, error } = useApi(
    `propositions?statut=${toutes ? 'toutes' : 'en_attente'}`,
    version,
  );

  // Après une réponse : la liste et le compteur de l'en-tête se mettent à jour
  const apresReponse = () => {
    setVersion((v) => v + 1);
    signalerChangement();
  };

  return (
    <div className="page">
      <div className="page-entete">
        <div>
          <h1>Propositions des athlètes</h1>
          <p className="texte-discret">
            Changements de date ou de contenu proposés sur des séances prévues.
          </p>
        </div>
        <label className="radio">
          <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} />
          Afficher aussi les propositions traitées
        </label>
      </div>
      <ErrorMessage message={error} />
      {!data && !error && <Loading />}
      {data?.length === 0 && <p className="vide">Aucune proposition en attente.</p>}
      <ul className="liste-propositions">
        {data?.map((p) => (
          <li key={p.id}>
            <CarteProposition proposition={p} onRepondu={apresReponse} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CarteProposition({ proposition: p, onRepondu }) {
  const [reponse, setReponse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const { seance } = p;

  async function repondre(decision) {
    setEnvoi(true);
    setErreur('');
    try {
      await api(`propositions/${p.id}/${decision}`, { method: 'POST', body: { reponse } });
      onRepondu();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <article className={`carte carte-proposition proposition-${p.statut}`}>
      <header className="carte-proposition-entete">
        <div>
          <strong>
            {p.athlete.prenom} {p.athlete.nom}
          </strong>{' '}
          · {seance.titre} ({libelleSport(seance.sport)}, {formaterDate(seance.date)})
        </div>
        <span className="texte-discret">
          {STATUTS_PROPOSITION[p.statut]} · {new Date(p.dateCreation).toLocaleDateString('fr-FR')}
        </span>
      </header>
      {p.message && <p className="retour-commentaire">« {p.message} »</p>}
      {/* Une fois acceptée, la séance contient déjà les changements : la comparaison n'a plus de sens */}
      {p.statut === 'en_attente' ? (
        <Comparaison seance={seance} changements={p.changements} />
      ) : (
        p.reponse && <p className="texte-discret">Votre réponse : « {p.reponse} »</p>
      )}
      {p.statut === 'en_attente' && (
        <div className="form">
          <ErrorMessage message={erreur} />
          <label>
            Réponse à l’athlète (facultatif)
            <textarea
              rows={2}
              maxLength={1000}
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
            />
          </label>
          <div className="form-actions form-actions-multiples">
            <Link
              to={`/coach/athletes/${p.athlete.id}?vue=semaine&date=${seance.date}`}
              className="btn btn-ghost"
            >
              Voir le calendrier
            </Link>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => repondre('refuser')}
              disabled={envoi}
            >
              Refuser
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => repondre('accepter')}
              disabled={envoi}
            >
              Accepter
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
