import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { debutSemaine } from '../dates.js';
import { useSeancesSemaine } from '../useSeancesSemaine.js';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import RetourForm from '../components/RetourForm.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import WeekCalendar, { WeekNav } from '../components/WeekCalendar.jsx';

// Vérification régulière pendant qu'une demande attend la réponse du coach
const INTERVALLE_DEMANDE_MS = 15000;

// Espace de l'athlète : choisir un coach, puis consulter son calendrier.
export default function AthletePage() {
  const { user } = useAuth();
  if (!user.coach) return <ChoisirCoach demande={user.demande} />;
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
          Coach : {coach.prenom} {coach.nom} · <Link to="/athlete/messages">Lui écrire</Link>
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

// L'athlète sans coach choisit un coach dans la liste et attend sa validation.
function ChoisirCoach({ demande }) {
  const { refreshUser } = useAuth();
  const enAttente = demande?.statut === 'en_attente';
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // Pendant l'attente, on vérifie régulièrement si le coach a répondu
  useEffect(() => {
    if (!enAttente) return;
    const minuterie = setInterval(() => {
      if (!document.hidden) refreshUser().catch(() => {});
    }, INTERVALLE_DEMANDE_MS);
    return () => clearInterval(minuterie);
  }, [enAttente, refreshUser]);

  // Envoie ou annule une demande, puis recharge le profil (qui contient la demande)
  async function agir(action) {
    setEnvoi(true);
    setErreur('');
    try {
      await action();
      await refreshUser();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  const demander = (coach) =>
    agir(() => api('demandes', { method: 'POST', body: { coachId: coach.id } }));
  const annuler = () => agir(() => api('demandes', { method: 'DELETE' }));

  if (enAttente) {
    const { coach } = demande;
    return (
      <div className="page">
        <div className="carte attente">
          <h1>Demande envoyée</h1>
          <p>
            Votre demande a été envoyée à{' '}
            <strong>
              {coach.prenom} {coach.nom}
            </strong>
            . Votre programme apparaîtra ici dès que votre coach l’aura acceptée.
          </p>
          <ErrorMessage message={erreur} />
          <button type="button" className="btn btn-ghost" onClick={annuler} disabled={envoi}>
            Annuler la demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div>
        <h1>Choisir mon coach</h1>
        <p className="texte-discret">
          Sélectionnez votre coach : il recevra votre demande et devra la valider.
        </p>
      </div>
      {demande?.statut === 'refusee' && (
        <p className="error" role="alert">
          {demande.coach.prenom} {demande.coach.nom} a refusé votre demande. Vous pouvez choisir un
          autre coach.
        </p>
      )}
      <ErrorMessage message={erreur} />
      <ListeCoachs onChoisir={demander} desactive={envoi} />
    </div>
  );
}

function ListeCoachs({ onChoisir, desactive }) {
  const [coachs, setCoachs] = useState(null);
  const [erreur, setErreur] = useState('');
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    api('coachs')
      .then(setCoachs)
      .catch((err) => setErreur(err.message));
  }, []);

  if (erreur) return <ErrorMessage message={erreur} />;
  if (!coachs) return <Loading />;
  if (coachs.length === 0) return <p className="vide">Aucun coach n’est encore inscrit.</p>;

  const terme = recherche.trim().toLowerCase();
  const filtres = coachs.filter((c) => `${c.prenom} ${c.nom}`.toLowerCase().includes(terme));

  return (
    <section className="section">
      <input
        type="search"
        className="recherche"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un coach…"
        aria-label="Rechercher un coach"
      />
      {filtres.length === 0 && <p className="vide">Aucun coach ne correspond à « {recherche} ».</p>}
      <ul className="liste-athletes">
        {filtres.map((c) => (
          <li key={c.id} className="carte carte-athlete">
            <span className="avatar" aria-hidden="true">
              {c.prenom[0]}
              {c.nom[0]}
            </span>
            <strong className="carte-athlete-nom">
              {c.prenom} {c.nom}
            </strong>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onChoisir(c)}
              disabled={desactive}
            >
              Demander
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
