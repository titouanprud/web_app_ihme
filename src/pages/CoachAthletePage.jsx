import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { debutSemaine, formaterDate } from '../dates.js';
import { useSeancesSemaine } from '../useSeancesSemaine.js';
import DupliquerForm from '../components/DupliquerForm.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import NouvelleSeance from '../components/NouvelleSeance.jsx';
import RetourForm from '../components/RetourForm.jsx';
import { ProfilAthleteCoach, useProfil } from '../components/ProfilSportif.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import SeanceForm from '../components/SeanceForm.jsx';
import WeekCalendar, { WeekNav } from '../components/WeekCalendar.jsx';

// Calendrier d'un athlète vu par son coach : création, modification, duplication,
// suppression, enregistrement comme modèle et lecture des retours.
// moi = true : « Mon entraînement », le calendrier du coach lui-même (athleteId = son id).
// Il y fait aussi le retour de ses séances et saisit ses propres records.
export default function CoachAthletePage({ moi = false }) {
  const { user } = useAuth();
  const params = useParams();
  const athleteId = moi ? String(user.id) : params.athleteId;
  const [athletes, setAthletes] = useState(null);
  const [erreurAthlete, setErreurAthlete] = useState('');
  const [lundi, setLundi] = useState(debutSemaine());
  const { seances, loading, error, recharger } = useSeancesSemaine(lundi, athleteId);
  // Profil de l'athlète (records, seuils) : affiché, et utilisé pour les allures @10k, @SV1…
  const { profil, setProfil, erreur: erreurProfil } = useProfil(athleteId);

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

  // Le coach peut dupliquer une séance vers un de ses athlètes ou vers lui-même
  const moiCommeAthlete = { id: user.id, prenom: user.prenom, nom: `${user.nom} (moi)` };
  const destinataires = athletes ? [moiCommeAthlete, ...athletes] : null;
  const athlete = destinataires?.find((a) => String(a.id) === athleteId);

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
    const pour = destinataires.find((a) => a.id === copie.athleteId);
    setMessage(`Copie créée le ${formaterDate(copie.date)} pour ${pour.prenom} ${pour.nom}.`);
  }

  // Retour du coach sur une de ses propres séances
  async function envoyerRetour(retour) {
    const seance = await api(`seances/${fenetre.seance.id}/retour`, {
      method: 'POST',
      body: retour,
    });
    setFenetre({ mode: 'voir', seance });
    recharger();
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
        <h1>{moi ? 'Mon entraînement' : `${athlete.prenom} ${athlete.nom}`}</h1>
        <div className="page-actions">
          {!moi && (
            <Link to={`/coach/athletes/${athleteId}/messages`} className="btn btn-ghost">
              Messages
            </Link>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFenetre({ mode: 'creer', date: lundi })}
          >
            + Nouvelle séance
          </button>
        </div>
      </div>

      <ProfilAthleteCoach
        athleteId={athleteId}
        profil={profil}
        setProfil={setProfil}
        erreur={erreurProfil}
        moi={moi}
      />
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
          <NouvelleSeance date={fenetre.date} onSubmit={creer} onCancel={fermer} profil={profil} />
        </Modal>
      )}
      {fenetre?.mode === 'voir' && (
        <Modal titre={fenetre.seance.titre} onClose={fermer}>
          <SeanceDetails seance={fenetre.seance} />
          {moi && (
            <RetourForm key={fenetre.seance.id} seance={fenetre.seance} onSubmit={envoyerRetour} />
          )}
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
            profil={profil}
          />
        </Modal>
      )}
      {fenetre?.mode === 'dupliquer' && (
        <Modal titre="Dupliquer la séance" onClose={fermer}>
          <DupliquerForm
            seance={fenetre.seance}
            athletes={destinataires}
            onSubmit={dupliquer}
            onCancel={() => voir(fenetre.seance)}
          />
        </Modal>
      )}
    </div>
  );
}
