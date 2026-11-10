import { useState } from 'react';
import { libelleSport, resumerTotaux } from '../blocs.js';
import { libelleType } from '../libelles.js';
import { useCatalogue } from '../useCatalogue.js';
import BlocsAffichage from '../components/BlocsAffichage.jsx';
import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import Modal from '../components/Modal.jsx';
import SeanceForm from '../components/SeanceForm.jsx';

// Catalogue du coach : séances types réutilisables (sans date).
// Pour les utiliser : les glisser depuis le panneau à gauche du calendrier d'un athlète,
// ou « + Nouvelle séance » → « Partir d'un modèle ».
export default function BibliothequePage() {
  const { modeles, erreur, creer, modifier, supprimer } = useCatalogue();
  // Fenêtre : null, { mode: 'creer' } ou { mode: 'modifier', modele }
  const [fenetre, setFenetre] = useState(null);
  const [ouvert, setOuvert] = useState(null); // id du modèle dont on affiche le détail

  async function enregistrer(valeurs) {
    if (fenetre.mode === 'creer') await creer(valeurs);
    else await modifier(fenetre.modele.id, valeurs);
    setFenetre(null);
  }

  return (
    <div className="page">
      <div className="page-entete">
        <div>
          <h1>Mon catalogue</h1>
          <p className="texte-discret">
            Vos séances types, à glisser sur le calendrier d’un athlète (ou sur le vôtre).
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
          sur « Ajouter au catalogue ».
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
                  Retirer
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
            onSubmit={enregistrer}
            onCancel={() => setFenetre(null)}
            avecDate={false}
          />
        </Modal>
      )}
    </div>
  );
}
