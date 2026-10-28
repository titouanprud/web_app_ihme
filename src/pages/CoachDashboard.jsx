import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { signalerChangement, useNotifications } from '../notifications.js';
import { Compteur, ErrorMessage, Loading } from '../components/Feedback.jsx';

// Accueil du coach : demandes en attente et liste de ses athlètes.
export default function CoachDashboard() {
  const { user } = useAuth();
  const notifs = useNotifications(user.id);
  const [athletes, setAthletes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api('athletes')
      .then(setAthletes)
      .catch((err) => setErreur(err.message));
  }, [version]);

  // Après avoir accepté une demande, la liste des athlètes change
  const rechargerAthletes = useCallback(() => setVersion((v) => v + 1), []);

  return (
    <div className="page">
      <h1>Mes athlètes</h1>
      <Demandes nombre={notifs?.demandesEnAttente} onAcceptee={rechargerAthletes} />

      <section className="section">
        <ErrorMessage message={erreur} />
        {!athletes && !erreur && <Loading />}
        {athletes?.length === 0 && (
          <p className="vide">
            Aucun athlète pour l’instant. Les athlètes qui vous choisissent comme coach apparaîtront
            dans « Demandes en attente » ci-dessus.
          </p>
        )}
        {athletes?.length > 0 && (
          <ul className="liste-athletes">
            {athletes.map((a) => (
              <li key={a.id} className="carte carte-athlete">
                <span className="avatar" aria-hidden="true">
                  {a.prenom[0]}
                  {a.nom[0]}
                </span>
                <span className="carte-athlete-nom">
                  <strong>
                    {a.prenom} {a.nom}
                  </strong>
                  <span className="texte-discret">{a.email}</span>
                </span>
                <span className="carte-athlete-actions">
                  <Link to={`/coach/athletes/${a.id}`} className="btn btn-ghost">
                    Calendrier
                  </Link>
                  <Link to={`/coach/athletes/${a.id}/messages`} className="btn btn-ghost">
                    Messages
                    <Compteur nombre={notifs?.parAthlete[a.id]} libelle="messages non lus" />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Demandes envoyées par des athlètes, à accepter ou refuser.
// "nombre" vient des notifications : quand il change, une demande est arrivée → on recharge.
function Demandes({ nombre, onAcceptee }) {
  const [demandes, setDemandes] = useState([]);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(null); // id de l'athlète en cours de traitement

  useEffect(() => {
    api('demandes')
      .then(setDemandes)
      .catch((err) => setErreur(err.message));
  }, [nombre]);

  async function repondre(demande, decision) {
    setEnCours(demande.athleteId);
    setErreur('');
    try {
      await api(`demandes/${demande.athleteId}/${decision}`, { method: 'POST' });
      setDemandes((liste) => liste.filter((d) => d.athleteId !== demande.athleteId));
      signalerChangement();
      if (decision === 'accepter') onAcceptee();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(null);
    }
  }

  if (demandes.length === 0 && !erreur) return null;
  return (
    <section className="carte demandes">
      <h2>Demandes en attente</h2>
      <ErrorMessage message={erreur} />
      <ul>
        {demandes.map((d) => (
          <li key={d.athleteId} className="demande">
            <span>
              <strong>
                {d.prenom} {d.nom}
              </strong>{' '}
              <span className="texte-discret">
                souhaite vous rejoindre · {new Date(d.dateDemande).toLocaleDateString('fr-FR')}
              </span>
            </span>
            <span className="demande-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => repondre(d, 'refuser')}
                disabled={enCours === d.athleteId}
              >
                Refuser
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => repondre(d, 'accepter')}
                disabled={enCours === d.athleteId}
              >
                Accepter
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
