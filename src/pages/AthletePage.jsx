import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { debutSemaine } from '../dates.js';
import { useSeancesSemaine } from '../useSeancesSemaine.js';
import { ErrorMessage } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import RetourForm from '../components/RetourForm.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import WeekCalendar, { WeekNav } from '../components/WeekCalendar.jsx';

// Espace de l'athlète : rejoindre un coach, puis consulter son calendrier.
export default function AthletePage() {
  const { user } = useAuth();
  if (!user.coach) return <RejoindreCoach />;
  return <MonCalendrier coach={user.coach} />;
}

function MonCalendrier({ coach }) {
  const [lundi, setLundi] = useState(debutSemaine());
  const { seances, loading, error, remplacerSeance } = useSeancesSemaine(lundi);
  const [ouverte, setOuverte] = useState(null);

  async function envoyerRetour(retour) {
    const seance = await api(`seances/${ouverte.id}/retour`, { method: 'POST', body: retour });
    setOuverte(seance);
    remplacerSeance(seance);
  }

  return (
    <div className="page">
      <div className="page-entete">
        <h1>Mon programme</h1>
        <span className="texte-discret">
          Coach : {coach.prenom} {coach.nom}
        </span>
      </div>
      <WeekNav lundi={lundi} onChange={setLundi} />
      <ErrorMessage message={error} />
      <WeekCalendar lundi={lundi} seances={seances} loading={loading} onOuvrir={setOuverte} />

      {ouverte && (
        <Modal titre={ouverte.titre} onClose={() => setOuverte(null)}>
          <SeanceDetails seance={ouverte} />
          {/* key : réinitialise le formulaire quand on change de séance */}
          <RetourForm key={ouverte.id} seance={ouverte} onSubmit={envoyerRetour} />
        </Modal>
      )}
    </div>
  );
}

function RejoindreCoach() {
  const { refreshUser } = useAuth();
  const [code, setCode] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      await api('invitations/accept', { method: 'POST', body: { code } });
      // Recharge le profil : user.coach est maintenant rempli, le calendrier s'affiche
      await refreshUser();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="page">
      <div className="carte rejoindre">
        <h1>Rejoindre mon coach</h1>
        <p className="texte-discret">
          Saisissez le code d’invitation que votre coach vous a transmis pour accéder à votre
          programme.
        </p>
        <form className="form" onSubmit={envoyer}>
          <ErrorMessage message={erreur} />
          <label>
            Code d’invitation
            <input
              className="input-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={20}
              placeholder="EX : K7M2QR9P"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-large" disabled={envoi}>
            {envoi ? 'Vérification…' : 'Rejoindre'}
          </button>
        </form>
      </div>
    </div>
  );
}
