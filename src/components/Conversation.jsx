import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { signalerChangement } from '../notifications.js';
import { ErrorMessage, Loading } from './Feedback.jsx';

const INTERVALLE_MS = 5000;

function formaterHeure(dateISO) {
  return new Date(dateISO).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Conversation entre un coach et un athlète.
// athleteId est fourni côté coach ; côté athlète, le serveur utilise son propre coach.
export default function Conversation({ athleteId, interlocuteur }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState(null);
  const [erreur, setErreur] = useState('');
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const listeRef = useRef(null);

  const chemin = athleteId ? `messages?athleteId=${athleteId}` : 'messages';

  // Chargement puis nouvelle vérification toutes les 5 secondes
  useEffect(() => {
    let annule = false;
    const charger = (premierChargement) => {
      api(chemin)
        .then((liste) => {
          if (annule) return;
          setMessages(liste);
          setErreur('');
          // Les messages viennent d'être marqués comme lus : on met à jour l'en-tête
          if (premierChargement) signalerChangement();
        })
        .catch((err) => !annule && setErreur(err.message));
    };
    charger(true);
    const minuterie = setInterval(() => !document.hidden && charger(false), INTERVALLE_MS);
    return () => {
      annule = true;
      clearInterval(minuterie);
    };
  }, [chemin]);

  // Fait défiler la liste jusqu'au dernier message quand il en arrive un nouveau
  const nombre = messages?.length ?? 0;
  useEffect(() => {
    const liste = listeRef.current;
    if (liste) liste.scrollTop = liste.scrollHeight;
  }, [nombre]);

  async function envoyer(e) {
    e.preventDefault();
    if (!texte.trim()) return;
    setEnvoi(true);
    setErreur('');
    try {
      const message = await api('messages', {
        method: 'POST',
        body: { athleteId: athleteId ? Number(athleteId) : undefined, contenu: texte },
      });
      setMessages((liste) => [...(liste ?? []), message]);
      setTexte('');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  // Entrée envoie le message, Maj + Entrée ajoute une ligne
  function surTouche(e) {
    if (e.key === 'Enter' && !e.shiftKey) envoyer(e);
  }

  return (
    <div className="carte conversation">
      <div className="conversation-messages" ref={listeRef}>
        {!messages && !erreur && <Loading />}
        {messages?.length === 0 && (
          <p className="conversation-vide">
            Aucun message pour l’instant. Écrivez à {interlocuteur} !
          </p>
        )}
        {messages?.map((m) => {
          const moi = m.auteurId === user.id;
          return (
            <div key={m.id} className={`bulle ${moi ? 'bulle-moi' : 'bulle-autre'}`}>
              <p>{m.contenu}</p>
              <span className="bulle-heure">{formaterHeure(m.dateEnvoi)}</span>
            </div>
          );
        })}
      </div>
      <ErrorMessage message={erreur} />
      <form className="conversation-saisie" onSubmit={envoyer}>
        <textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={surTouche}
          rows={2}
          maxLength={2000}
          placeholder={`Message à ${interlocuteur}…`}
          aria-label="Votre message"
        />
        <button type="submit" className="btn btn-primary" disabled={envoi || !texte.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
