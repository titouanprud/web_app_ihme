import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { debutSemaine } from '../dates.js';
import { useSeancesSemaine } from '../useSeancesSemaine.js';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import SeanceForm from '../components/SeanceForm.jsx';
import WeekCalendar, { WeekNav } from '../components/WeekCalendar.jsx';

// Calendrier d'un athlète vu par son coach : création, modification, suppression, retours.
export default function CoachAthletePage() {
  const { athleteId } = useParams();
  const [athlete, setAthlete] = useState(null);
  const [erreurAthlete, setErreurAthlete] = useState('');
  const [lundi, setLundi] = useState(debutSemaine());
  const { seances, loading, error, recharger } = useSeancesSemaine(lundi, athleteId);

  // Fenêtre ouverte : null, { mode: 'voir', seance }, { mode: 'modifier', seance } ou { mode: 'creer', date }
  const [fenetre, setFenetre] = useState(null);
  const fermer = () => setFenetre(null);

  useEffect(() => {
    api('athletes')
      .then((liste) => {
        const trouve = liste.find((a) => String(a.id) === athleteId);
        if (trouve) setAthlete(trouve);
        else setErreurAthlete('Cet athlète ne fait pas partie de votre groupe.');
      })
      .catch((err) => setErreurAthlete(err.message));
  }, [athleteId]);

  async function creer(valeurs) {
    await api('seances', { method: 'POST', body: { ...valeurs, athleteId: Number(athleteId) } });
    fermer();
    recharger();
  }

  async function modifier(valeurs) {
    const seance = await api(`seances/${fenetre.seance.id}`, { method: 'PUT', body: valeurs });
    setFenetre({ mode: 'voir', seance });
    recharger();
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

  if (erreurAthlete) {
    return (
      <div className="page">
        <Link to="/coach" className="retour-lien">
          ← Mes athlètes
        </Link>
        <ErrorMessage message={erreurAthlete} />
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

      <WeekNav lundi={lundi} onChange={setLundi} />
      <ErrorMessage message={error} />
      <WeekCalendar
        lundi={lundi}
        seances={seances}
        loading={loading}
        onOuvrir={(seance) => setFenetre({ mode: 'voir', seance })}
        onAjouter={(date) => setFenetre({ mode: 'creer', date })}
      />

      {fenetre?.mode === 'creer' && (
        <Modal titre="Nouvelle séance" onClose={fermer}>
          <SeanceForm initial={{ date: fenetre.date }} onSubmit={creer} onCancel={fermer} />
        </Modal>
      )}
      {fenetre?.mode === 'voir' && (
        <Modal titre={fenetre.seance.titre} onClose={fermer}>
          <SeanceDetails seance={fenetre.seance} />
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => supprimer(fenetre.seance)}
            >
              Supprimer
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
        <Modal titre="Modifier la séance" onClose={fermer}>
          <SeanceForm
            initial={fenetre.seance}
            onSubmit={modifier}
            onCancel={() => setFenetre({ mode: 'voir', seance: fenetre.seance })}
          />
        </Modal>
      )}
    </div>
  );
}
