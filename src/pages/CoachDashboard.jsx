import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';

// Accueil du coach : code d'invitation et liste de ses athlètes.
export default function CoachDashboard() {
  const [athletes, setAthletes] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api('athletes')
      .then(setAthletes)
      .catch((err) => setErreur(err.message));
  }, []);

  return (
    <div className="page">
      <h1>Mes athlètes</h1>
      <Invitation />

      <section className="section">
        <ErrorMessage message={erreur} />
        {!athletes && !erreur && <Loading />}
        {athletes?.length === 0 && (
          <p className="vide">
            Aucun athlète pour l’instant. Générez un code d’invitation ci-dessus et transmettez-le à
            vos athlètes : ils le saisiront dans leur espace.
          </p>
        )}
        {athletes?.length > 0 && (
          <ul className="liste-athletes">
            {athletes.map((a) => (
              <li key={a.id}>
                <Link to={`/coach/athletes/${a.id}`} className="carte carte-athlete">
                  <span className="avatar" aria-hidden="true">
                    {a.prenom[0]}
                    {a.nom[0]}
                  </span>
                  <span>
                    <strong>
                      {a.prenom} {a.nom}
                    </strong>
                    <span className="texte-discret">{a.email}</span>
                  </span>
                  <span className="fleche" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Invitation() {
  const [invitation, setInvitation] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  async function generer() {
    setEnvoi(true);
    setErreur('');
    try {
      setInvitation(await api('invitations', { method: 'POST' }));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="carte invitation">
      <div>
        <h2>Inviter un athlète</h2>
        <p className="texte-discret">
          Le code est valable 7 jours et peut servir à plusieurs athlètes.
        </p>
      </div>
      <ErrorMessage message={erreur} />
      {invitation ? (
        <div className="invitation-code">
          <code>{invitation.code}</code>
          <span className="texte-discret">
            Expire le {new Date(invitation.dateExpiration).toLocaleDateString('fr-FR')}
          </span>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={generer} disabled={envoi}>
          {envoi ? 'Génération…' : 'Générer un code'}
        </button>
      )}
    </section>
  );
}
