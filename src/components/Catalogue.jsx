import { useState } from 'react';
import { SPORTS, resumerTotaux } from '../blocs.js';
import { libelleType } from '../libelles.js';
import BlocsAffichage from './BlocsAffichage.jsx';
import { ErrorMessage, Loading } from './Feedback.jsx';
import { Deplacable, GlisserDeposerActif } from './GlisserDeposer.jsx';
import Modal from './Modal.jsx';
import SeanceForm from './SeanceForm.jsx';

// Panneau du catalogue, à gauche du calendrier de planification.
// Un onglet par sport, une recherche par titre ; chaque modèle se glisse sur un jour
// du calendrier pour créer une copie de la séance. catalogue = résultat de useCatalogue().
export default function Catalogue({ catalogue }) {
  const { modeles, erreur, creer, modifier, supprimer } = catalogue;
  const [sport, setSport] = useState('course');
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(null); // id du modèle dont on voit le détail
  // Fenêtre : null, { mode: 'creer' } ou { mode: 'modifier', modele }
  const [fenetre, setFenetre] = useState(null);

  const terme = recherche.trim().toLowerCase();
  const filtres = (modeles ?? []).filter(
    (m) => m.sport === sport && m.titre.toLowerCase().includes(terme),
  );
  const nombreParSport = (valeur) => (modeles ?? []).filter((m) => m.sport === valeur).length;

  async function enregistrer(valeurs) {
    if (fenetre.mode === 'creer') {
      const modele = await creer(valeurs);
      setSport(modele.sport);
    } else {
      await modifier(fenetre.modele.id, valeurs);
    }
    setFenetre(null);
  }

  return (
    <aside className="catalogue carte" aria-label="Catalogue de séances">
      <div className="catalogue-entete">
        <h2>Catalogue</h2>
        <button
          type="button"
          className="btn btn-ghost btn-petit"
          onClick={() => setFenetre({ mode: 'creer' })}
        >
          + Modèle
        </button>
      </div>
      <p className="texte-discret catalogue-aide">
        Glissez un modèle sur un jour du calendrier pour le programmer.
      </p>
      <div className="catalogue-onglets" role="tablist">
        {SPORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={s.value === sport}
            className={`catalogue-onglet sport-${s.value}${s.value === sport ? ' actif' : ''}`}
            onClick={() => setSport(s.value)}
          >
            {s.label} <span className="texte-discret">{nombreParSport(s.value)}</span>
          </button>
        ))}
      </div>
      <input
        type="search"
        className="recherche"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un titre…"
        aria-label="Rechercher un modèle par titre"
      />
      <ErrorMessage message={erreur} />
      {!modeles && !erreur && <Loading />}
      {modeles && filtres.length === 0 && <p className="vide">Aucun modèle.</p>}

      {/* Les modèles sont déplaçables : le contexte active le glisser-déposer */}
      <GlisserDeposerActif.Provider value={true}>
        <ul className="catalogue-liste">
          {filtres.map((m) => (
            <li key={m.id}>
              <Deplacable id={`modele-${m.id}`} data={{ type: 'modele', modele: m }}>
                <button
                  type="button"
                  className={`catalogue-modele sport-${m.sport}`}
                  onClick={() => setOuvert(ouvert === m.id ? null : m.id)}
                  aria-expanded={ouvert === m.id}
                >
                  <strong>{m.titre}</strong>
                  <span className="texte-discret">
                    {libelleType(m.type)}
                    {m.blocs.length > 0 && ` · ${resumerTotaux(m.blocs)}`}
                  </span>
                </button>
              </Deplacable>
              {ouvert === m.id && (
                <div className="catalogue-detail">
                  <BlocsAffichage blocs={m.blocs} />
                  {m.description && <p className="details-description">{m.description}</p>}
                  <div className="page-actions">
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
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </GlisserDeposerActif.Provider>

      {fenetre && (
        <Modal
          titre={fenetre.mode === 'creer' ? 'Nouveau modèle' : 'Modifier le modèle'}
          onClose={() => setFenetre(null)}
          large
        >
          <SeanceForm
            initial={fenetre.modele ?? { sport }}
            onSubmit={enregistrer}
            onCancel={() => setFenetre(null)}
            avecDate={false}
          />
        </Modal>
      )}
    </aside>
  );
}
