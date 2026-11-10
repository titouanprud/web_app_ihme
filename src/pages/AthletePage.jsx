import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Calendrier from '../components/Calendrier.jsx';
import { CycleDetails } from '../components/Cycles.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import { useProfil } from '../components/ProfilSportif.jsx';
import { PropositionForm, SuiviProposition } from '../components/Propositions.jsx';
import RetourForm from '../components/RetourForm.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';

// Vérification régulière pendant qu'une demande attend la réponse du coach
const INTERVALLE_DEMANDE_MS = 15000;

// Espace de l'athlète : choisir un coach, puis consulter son calendrier.
export default function AthletePage() {
  const { user } = useAuth();
  if (!user.coach) return <ChoisirCoach demande={user.demande} />;
  return <MonCalendrier coach={user.coach} />;
}

function MonCalendrier({ coach }) {
  const [ouverte, setOuverte] = useState(null);
  const [proposer, setProposer] = useState(false); // formulaire de proposition affiché
  // Son profil : pour les allures de référence (@10k…) s'il propose une nouvelle structure
  const { profil } = useProfil();
  const [cycleOuvert, setCycleOuvert] = useState(null); // lecture seule pour l'athlète
  // Augmentée après un retour : le calendrier se recharge
  const [version, setVersion] = useState(0);

  async function envoyerRetour(retour) {
    const seance = await api(`seances/${ouverte.id}/retour`, { method: 'POST', body: retour });
    setOuverte(seance);
    setVersion((v) => v + 1);
  }

  const ouvrir = (seance) => {
    setOuverte(seance);
    setProposer(false);
  };

  // Proposition de modification : la séance ne change pas tant que le coach n'a pas accepté
  async function envoyerProposition({ changements, message }) {
    const proposition = await api('propositions', {
      method: 'POST',
      body: { seanceId: ouverte.id, changements, message },
    });
    setOuverte({ ...ouverte, proposition: { ...proposition, message, reponse: '' } });
    setProposer(false);
    setVersion((v) => v + 1);
  }

  async function annulerProposition() {
    if (!window.confirm('Annuler votre proposition ?')) return;
    try {
      await api(`propositions/${ouverte.proposition.id}`, { method: 'DELETE' });
      setOuverte({ ...ouverte, proposition: null });
      setVersion((v) => v + 1);
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Une proposition est possible sur une séance prévue, sans autre proposition en attente
  const peutProposer = ouverte?.statut === 'prevue' && ouverte.proposition?.statut !== 'en_attente';

  return (
    <div className="page">
      <div className="page-entete">
        <h1>Mon programme</h1>
        <span className="texte-discret">
          Coach : {coach.prenom} {coach.nom} · <Link to="/athlete/messages">Lui écrire</Link>
        </span>
      </div>
      <Calendrier version={version} onOuvrir={ouvrir} onOuvrirCycle={setCycleOuvert} />

      {cycleOuvert && (
        <Modal titre={cycleOuvert.nom} onClose={() => setCycleOuvert(null)}>
          <CycleDetails cycle={cycleOuvert} />
        </Modal>
      )}
      {ouverte && proposer && (
        <Modal
          titre={`Proposer une modification · ${ouverte.titre}`}
          onClose={() => setProposer(false)}
          large
        >
          <PropositionForm
            seance={ouverte}
            profil={profil}
            onSubmit={envoyerProposition}
            onCancel={() => setProposer(false)}
          />
        </Modal>
      )}
      {ouverte && !proposer && (
        <Modal titre={ouverte.titre} onClose={() => setOuverte(null)}>
          <SeanceDetails seance={ouverte} />
          <SuiviProposition seance={ouverte} onAnnuler={annulerProposition} />
          {peutProposer && (
            <button type="button" className="btn btn-ghost" onClick={() => setProposer(true)}>
              Proposer une modification (date, contenu)
            </button>
          )}
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
