import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { formaterDate, toISODate } from '../dates.js';
import { useCatalogue } from '../useCatalogue.js';
import Calendrier from '../components/Calendrier.jsx';
import Catalogue from '../components/Catalogue.jsx';
import { CycleDetails, CycleForm } from '../components/Cycles.jsx';
import DupliquerForm from '../components/DupliquerForm.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import NouvelleSeance from '../components/NouvelleSeance.jsx';
import RetourForm from '../components/RetourForm.jsx';
import { ProfilAthleteCoach, useProfil } from '../components/ProfilSportif.jsx';
import SeanceDetails from '../components/SeanceDetails.jsx';
import SeanceForm from '../components/SeanceForm.jsx';

// Calendrier d'un athlète vu par son coach : création, modification, duplication,
// suppression, ajout au catalogue et lecture des retours. Le catalogue, à gauche, se glisse
// sur un jour du calendrier ; une séance se glisse aussi d'un jour à un autre.
// moi = true : « Mon entraînement », le calendrier du coach lui-même (athleteId = son id).
// Il y fait aussi le retour de ses séances et saisit ses propres records.
export default function CoachAthletePage({ moi = false }) {
  const { user } = useAuth();
  const params = useParams();
  const athleteId = moi ? String(user.id) : params.athleteId;
  const [athletes, setAthletes] = useState(null);
  const [erreurAthlete, setErreurAthlete] = useState('');
  // Augmentée après chaque modification : le calendrier (séances et totaux) se recharge
  const [version, setVersion] = useState(0);
  const recharger = () => setVersion((v) => v + 1);
  // Profil de l'athlète (records, seuils) : affiché, et utilisé pour les allures @10k, @SV1…
  const { profil, setProfil, erreur: erreurProfil } = useProfil(athleteId);
  const catalogue = useCatalogue();

  // Glisser-déposer : la souris démarre après 6 px de mouvement (un simple clic ouvre toujours
  // la séance) ; au doigt, après un appui de 200 ms (un glissement rapide fait défiler la page).
  const capteurs = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const [enDeplacement, setEnDeplacement] = useState(null); // modèle ou séance déplacé
  const [erreurDepot, setErreurDepot] = useState('');

  // Fenêtre ouverte : null ou { mode, seance?, date?, cycle? }
  // modes : 'creer', 'voir', 'modifier', 'dupliquer' (séance) ;
  //         'cycle', 'cycle-creer', 'cycle-modifier' (cycle)
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

  async function ajouterAuCatalogue(seance) {
    try {
      await catalogue.creer(seance);
      setMessage('Séance ajoutée au catalogue.');
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Fin d'un glisser-déposer : "active" = ce qui est déplacé, "over" = le jour visé (ou null)
  async function deposer({ active, over }) {
    setEnDeplacement(null);
    if (!over) return;
    const date = over.data.current.date;
    const objet = active.data.current;
    setErreurDepot('');
    try {
      if (objet.type === 'modele') {
        // Copie du modèle pour cet athlète à cette date (le modèle ne change pas)
        await api('seances/depuis-modele', {
          method: 'POST',
          body: { modeleId: objet.modele.id, athleteId: Number(athleteId), date },
        });
      } else if (objet.seance.date !== date) {
        // Déplacement d'une séance existante : même contenu, nouvelle date
        await api(`seances/${objet.seance.id}`, {
          method: 'PUT',
          body: { ...objet.seance, date },
        });
      } else {
        return;
      }
      recharger();
    } catch (err) {
      setErreurDepot(err.message);
    }
  }

  // ----- Cycles -----
  async function enregistrerCycle(valeurs) {
    if (fenetre.mode === 'cycle-creer') {
      await api('cycles', { method: 'POST', body: { ...valeurs, athleteId: Number(athleteId) } });
    } else {
      await api(`cycles/${fenetre.cycle.id}`, { method: 'PUT', body: valeurs });
    }
    fermer();
    recharger();
  }

  async function supprimerCycle(cycle) {
    if (!window.confirm(`Supprimer le cycle « ${cycle.nom} » ? Les séances restent.`)) return;
    try {
      await api(`cycles/${cycle.id}`, { method: 'DELETE' });
      fermer();
      recharger();
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
            className="btn btn-ghost"
            onClick={() => setFenetre({ mode: 'cycle-creer' })}
          >
            + Cycle
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFenetre({ mode: 'creer', date: toISODate(new Date()) })}
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
      {/* pointerWithin : la séance est déposée sur le jour qui se trouve sous le pointeur */}
      <DndContext
        sensors={capteurs}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => {
          const objet = active.data.current;
          setEnDeplacement(objet.modele ?? objet.seance);
        }}
        onDragEnd={deposer}
        onDragCancel={() => setEnDeplacement(null)}
      >
        <div className="planification">
          <Catalogue catalogue={catalogue} />
          <div className="planification-calendrier">
            <ErrorMessage message={erreurDepot} />
            <Calendrier
              athleteId={athleteId}
              version={version}
              onOuvrir={voir}
              onAjouter={(date) => setFenetre({ mode: 'creer', date })}
              onOuvrirCycle={(cycle) => setFenetre({ mode: 'cycle', cycle })}
              glisserDeposer
            />
          </div>
        </div>
        {/* Aperçu qui suit le pointeur pendant le déplacement */}
        <DragOverlay>
          {enDeplacement && <div className="apercu-glisse">{enDeplacement.titre}</div>}
        </DragOverlay>
      </DndContext>

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
              onClick={() => ajouterAuCatalogue(fenetre.seance)}
            >
              Ajouter au catalogue
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
      {fenetre?.mode === 'cycle' && (
        <Modal titre={fenetre.cycle.nom} onClose={fermer}>
          <CycleDetails cycle={fenetre.cycle} athleteId={athleteId} />
          <div className="form-actions form-actions-multiples">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => supprimerCycle(fenetre.cycle)}
            >
              Supprimer
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setFenetre({ mode: 'cycle-modifier', cycle: fenetre.cycle })}
            >
              Modifier
            </button>
          </div>
        </Modal>
      )}
      {(fenetre?.mode === 'cycle-creer' || fenetre?.mode === 'cycle-modifier') && (
        <Modal titre={fenetre.cycle ? 'Modifier le cycle' : 'Nouveau cycle'} onClose={fermer} large>
          <CycleForm
            initial={fenetre.cycle}
            dateParDefaut={toISODate(new Date())}
            onSubmit={enregistrerCycle}
            onCancel={fermer}
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
