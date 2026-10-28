import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { libelleSport, resumerTotaux } from '../blocs.js';
import { libelleType } from '../libelles.js';
import BlocsAffichage from '../components/BlocsAffichage.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import SeanceForm from '../components/SeanceForm.jsx';

// Bibliothèque du coach : séances types réutilisables (sans date).
// Pour les utiliser : « + Nouvelle séance » dans le calendrier d'un athlète → « Partir d'un modèle ».
export default function BibliothequePage() {
  const [modeles, setModeles] = useState(null);
  const [erreur, setErreur] = useState('');
  // Fenêtre : null, { mode: 'creer' } ou { mode: 'modifier', modele }
  const [fenetre, setFenetre] = useState(null);
  const [ouvert, setOuvert] = useState(null); // id du modèle dont on affiche le détail

  useEffect(() => {
    api('seances-types')
      .then(setModeles)
      .catch((err) => setErreur(err.message));
  }, []);

  async function creer(valeurs) {
    const modele = await api('seances-types', { method: 'POST', body: valeurs });
    setModeles((liste) => [...liste, modele]);
    setFenetre(null);
  }

  async function modifier(valeurs) {
    const modele = await api(`seances-types/${fenetre.modele.id}`, {
      method: 'PUT',
      body: valeurs,
    });
    setModeles((liste) => liste.map((m) => (m.id === modele.id ? modele : m)));
    setFenetre(null);
  }

  async function supprimer(modele) {
    if (!window.confirm(`Supprimer le modèle « ${modele.titre} » ?`)) return;
    try {
      await api(`seances-types/${modele.id}`, { method: 'DELETE' });
      setModeles((liste) => liste.filter((m) => m.id !== modele.id));
    } catch (err) {
      setErreur(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-entete">
        <div>
          <h1>Ma bibliothèque</h1>
          <p className="texte-discret">
            Vos séances types, à réutiliser depuis « + Nouvelle séance » dans le calendrier d’un
            athlète.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setFenetre({ mode: 'creer' })}
        >
          + Nouveau modèle
        </button>
      </div>

      <ErrorMessage message={erreur} />
      {!modeles && !erreur && <Loading />}
      {modeles?.length === 0 && (
        <p className="vide">
          Aucun modèle pour l’instant. Créez-en un ici, ou ouvrez une séance existante et cliquez
          sur « Enregistrer comme modèle ».
        </p>
      )}
      <ul className="liste-modeles">
        {modeles?.map((m) => (
          <li key={m.id} className="carte modele">
            <div className="modele-entete">
              <button
                type="button"
                className="modele-titre"
                onClick={() => setOuvert(ouvert === m.id ? null : m.id)}
                aria-expanded={ouvert === m.id}
              >
                <strong>{m.titre}</strong>
                <span className="texte-discret">
                  {libelleSport(m.sport)} · {libelleType(m.type)}
                  {m.blocs.length > 0 && ` · ${resumerTotaux(m.blocs)}`}
                </span>
              </button>
              <span className="page-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-petit"
                  onClick={() => setFenetre({ mode: 'modifier', modele: m })}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-petit"
                  onClick={() => supprimer(m)}
                >
                  Supprimer
                </button>
              </span>
            </div>
            {ouvert === m.id && (
              <div className="modele-detail">
                <BlocsAffichage blocs={m.blocs} />
                {m.description && <p className="details-description">{m.description}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>

      {fenetre && (
        <Modal
          titre={fenetre.mode === 'creer' ? 'Nouveau modèle' : 'Modifier le modèle'}
          onClose={() => setFenetre(null)}
          large
        >
          <SeanceForm
            initial={fenetre.modele ?? {}}
            onSubmit={fenetre.mode === 'creer' ? creer : modifier}
            onCancel={() => setFenetre(null)}
            avecDate={false}
          />
        </Modal>
      )}
    </div>
  );
}
