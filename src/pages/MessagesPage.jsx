import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Conversation from '../components/Conversation.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';

// Messagerie de l'athlète avec son coach
export function AthleteMessagesPage() {
  const { user } = useAuth();
  // Pas encore de coach : retour à l'espace athlète pour en choisir un
  if (!user.coach) return <Navigate to="/athlete" replace />;
  const nomCoach = `${user.coach.prenom} ${user.coach.nom}`;
  return (
    <div className="page">
      <h1>Messages avec {nomCoach}</h1>
      <Conversation interlocuteur={nomCoach} />
    </div>
  );
}

// Messagerie du coach avec un de ses athlètes
export function CoachMessagesPage() {
  const { athleteId } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    api('athletes')
      .then((liste) => {
        const trouve = liste.find((a) => String(a.id) === athleteId);
        if (trouve) setAthlete(trouve);
        else setErreur('Cet athlète ne fait pas partie de votre groupe.');
      })
      .catch((err) => setErreur(err.message));
  }, [athleteId]);

  const nom = athlete && `${athlete.prenom} ${athlete.nom}`;
  return (
    <div className="page">
      <Link to="/coach" className="retour-lien">
        ← Mes athlètes
      </Link>
      <ErrorMessage message={erreur} />
      {!athlete && !erreur && <Loading />}
      {athlete && (
        <>
          <div className="page-entete">
            <h1>Messages avec {nom}</h1>
            <Link to={`/coach/athletes/${athleteId}`} className="btn btn-ghost">
              Voir le calendrier
            </Link>
          </div>
          <Conversation athleteId={athleteId} interlocuteur={nom} />
        </>
      )}
    </div>
  );
}
