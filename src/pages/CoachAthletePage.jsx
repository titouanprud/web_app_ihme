import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { debutSemaine, formaterDate } from '../dates.js';
import { useSeancesSemaine } from '../useSeancesSemaine.js';
import DupliquerForm from '../components/DupliquerForm.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import NouvelleSeance from '../components/NouvelleSeance.jsx';
import { ProfilAthleteCoach } from '../components/ProfilSportif.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import SeanceForm from '../components/SeanceForm.jsx';
import WeekCalendar, { WeekNav } from '../components/WeekCalendar.jsx';

// Calendrier d'un athlète vu par son coach : création, modification, duplication,
// suppression, enregistrement comme modèle et lecture des retours.
export default function CoachAthletePage() {
  const { athleteId } = useParams();
  const [athletes, setAthletes] = useState(null);
  const [erreurAthlete, setErreurAthlete] = useState('');
  const [lundi, setLundi] = useState(debutSemaine());
  const { seances, loading, error, recharger } = useSeancesSemaine(lundi, athleteId);

  // Fenêtre ouverte : null ou { mode, seance?, date? }
  // modes : 'creer', 'voir', 'modifier', 'dupliquer'
  const [fenetre, setFenetre] = useState(null);
  const [message, setMessage] = useState('');
  const fermer = () => {
    setFenetre(null);
    setMessage('');
  };
  const voir = (seance) => {
    setFenetre({ mode: 'voir', seance });
    setMessage('');
  };

  useEffect(() => {
    api('athletes')
      .then(setAthletes)
      .catch((err) => setErreurAthlete(err.message));
  }, []);

  const athlete = athletes?.find((a) => String(a.id) === athleteId);

  async function creer(valeurs) {
    await api('seances', { method: 'POST', body: { ...valeurs, athleteId: Number(athleteId) } });
    fermer();
    recharger();
  }

  async function modifier(valeurs) {
    const seance = await api(`seances/${fenetre.seance.id}`, { method: 'PUT', body: valeurs });
    voir(seance);
    recharger();
  }

  async function dupliquer(cible) {
    const copie = await api(`seances/${fenetre.seance.id}/dupliquer`, {
      method: 'POST',
      body: cible,
    });
    recharger();
    voir(fenetre.seance);
    const pour = athletes.find((a) => a.id === copie.athleteId);
    setMessage(`Copie créée le ${formaterDate(copie.date)} pour ${pour.prenom} ${pour.nom}.`);
  }

  async function enregistrerModele(seance) {
    try {
      await api('seances-types', { method: 'POST', body: seance });
      setMessage('Séance ajoutée à votre bibliothèque.');
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function supprimer(seance) {
    if (!window.confirm(`Supprimer la séance « ${seance.titre} » ?`)) return;
    try {
      await api(`seances/${seance.id}`, { method: 'DELETE' });
      fermer();
      recharger();
    } catch (err) {
      window.alert(err.message);
    }
  }

  if (erreurAthlete || (athletes && !athlete)) {
    return (
      <div className="page">
        <Link to="/coach" className="retour-lien">
          ← Mes athlètes
        </Link>
        <ErrorMessage
          message={erreurAthlete || 'Cet athlète ne fait pas partie de votre groupe.'}
        />
      </div>
    );
  }
  if (!athlete) return <Loading />;

  return (
    <div className="page">
      <Link to="/coach" className="retour-lien">
        ← Mes athlètes
      </Link>
      <div className="page-entete">
        <h1>
          {athlete.prenom} {athlete.nom}
        </h1>
        <div className="page-actions">
          <Link to={`/coach/athletes/${athleteId}/messages`} className="btn btn-ghost">
            Messages
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFenetre({ mode: 'creer', date: lundi })}
          >
            + Nouvelle séance
          </button>
        </div>
      </div>

      <ProfilAthleteCoach athleteId={athleteId} />
      <WeekNav lundi={lundi} onChange={setLundi} />
      <ErrorMessage message={error} />
      <WeekCalendar
        lundi={lundi}
        seances={seances}
        loading={loading}
        onOuvrir={voir}
        onAjouter={(date) => setFenetre({ mode: 'creer', date })}
      />

      {fenetre?.mode === 'creer' && (
        <Modal titre="Nouvelle séance" onClose={fermer} large>
          <NouvelleSeance date={fenetre.date} onSubmit={creer} onCancel={fermer} />
        </Modal>
      )}
      {fenetre?.mode === 'voir' && (
        <Modal titre={fenetre.seance.titre} onClose={fermer}>
          <SeanceDetails seance={fenetre.seance} />
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <div className="form-actions form-actions-multiples">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => supprimer(fenetre.seance)}
            >
              Supprimer
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => enregistrerModele(fenetre.seance)}
            >
              Enregistrer comme modèle
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFenetre({ mode: 'dupliquer', seance: fenetre.seance })}
            >
              Dupliquer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFenetre({ mode: 'modifier', seance: fenetre.seance })}
            >
              Modifier
            </button>
          </div>
        </Modal>
      )}
      {fenetre?.mode === 'modifier' && (
        <Modal titre="Modifier la séance" onClose={fermer} large>
          <SeanceForm
            initial={fenetre.seance}
            onSubmit={modifier}
            onCancel={() => voir(fenetre.seance)}
          />
        </Modal>
      )}
      {fenetre?.mode === 'dupliquer' && (
        <Modal titre="Dupliquer la séance" onClose={fermer}>
          <DupliquerForm
            seance={fenetre.seance}
            athletes={athletes}
            onSubmit={dupliquer}
            onCancel={() => voir(fenetre.seance)}
          />
        </Modal>
      )}
    </div>
  );
}
