import {
  CIBLES_PAR_SPORT,
  LIBELLES_CIBLE,
  TYPES_BLOC,
  cibleParDefaut,
  formaterChrono,
  formaterDistance,
  lireChrono,
  lireDistance,
  nouveauBloc,
} from '../blocs.js';
import ChampTexteValide from './ChampTexteValide.jsx';

// Éditeur de la structure d'une séance : liste de blocs que l'on peut ajouter,
// modifier, déplacer (↑ ↓), dupliquer et supprimer.
export default function BlocsEditor({ blocs, sport, onChange }) {
  return <ListeBlocs blocs={blocs} sport={sport} onChange={onChange} imbrique={false} />;
}

const TYPES_AJOUTABLES = ['echauffement', 'intervalle', 'recuperation', 'retour_calme'];

// imbrique = true pour les blocs à l'intérieur d'une répétition (pas de répétition dedans)
function ListeBlocs({ blocs, sport, onChange, imbrique }) {
  const remplacer = (i, bloc) => onChange(blocs.map((b, j) => (j === i ? bloc : b)));
  const supprimer = (i) => onChange(blocs.filter((_, j) => j !== i));
  const dupliquer = (i) =>
    onChange([...blocs.slice(0, i + 1), structuredClone(blocs[i]), ...blocs.slice(i + 1)]);
  // Échange le bloc i avec son voisin (sens = -1 pour monter, +1 pour descendre)
  const deplacer = (i, sens) => {
    const copie = [...blocs];
    [copie[i], copie[i + sens]] = [copie[i + sens], copie[i]];
    onChange(copie);
  };

  const types = imbrique ? TYPES_AJOUTABLES : [...TYPES_AJOUTABLES, 'repetition'];

  return (
    <div className="blocs">
      {blocs.length > 0 && (
        <ol className="blocs-liste">
          {blocs.map((bloc, i) => (
            <li key={i} className={`bloc bloc-${bloc.type}`}>
              <div className="bloc-entete">
                <strong>
                  {i + 1}. {TYPES_BLOC[bloc.type]}
                </strong>
                <span className="bloc-actions">
                  <button
                    type="button"
                    onClick={() => deplacer(i, -1)}
                    disabled={i === 0}
                    aria-label="Monter le bloc"
                    title="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => deplacer(i, 1)}
                    disabled={i === blocs.length - 1}
                    aria-label="Descendre le bloc"
                    title="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => dupliquer(i)}
                    aria-label="Dupliquer le bloc"
                    title="Dupliquer"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    onClick={() => supprimer(i)}
                    aria-label="Supprimer le bloc"
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </span>
              </div>
              {bloc.type === 'repetition' ? (
                <ChampsRepetition bloc={bloc} sport={sport} onChange={(b) => remplacer(i, b)} />
              ) : (
                <ChampsBloc bloc={bloc} sport={sport} onChange={(b) => remplacer(i, b)} />
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="blocs-ajout">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className="btn btn-ghost btn-petit"
            onClick={() => onChange([...blocs, nouveauBloc(type, sport)])}
          >
            + {TYPES_BLOC[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChampsRepetition({ bloc, sport, onChange }) {
  return (
    <div className="bloc-champs">
      <label className="champ-court">
        Répéter
        <input
          type="number"
          min={2}
          max={50}
          value={bloc.repetitions}
          onChange={(e) => onChange({ ...bloc, repetitions: Number(e.target.value) })}
        />
      </label>
      <span className="texte-discret">fois :</span>
      <ListeBlocs
        blocs={bloc.blocs}
        sport={sport}
        onChange={(blocs) => onChange({ ...bloc, blocs })}
        imbrique
      />
    </div>
  );
}

function ChampsBloc({ bloc, sport, onChange }) {
  const changer = (modif) => onChange({ ...bloc, ...modif });
  const changerCible = (modif) => changer({ cible: { ...bloc.cible, ...modif } });
  const cible = bloc.cible ?? cibleParDefaut('aucune');

  return (
    <div className="bloc-champs">
      <label>
        Mesure
        <select
          value={bloc.mesure}
          onChange={(e) =>
            changer({ mesure: e.target.value, valeur: e.target.value === 'duree' ? 300 : 1000 })
          }
        >
          <option value="duree">Durée</option>
          <option value="distance">Distance</option>
        </select>
      </label>
      <label>
        {bloc.mesure === 'duree' ? 'Durée (min:s)' : 'Distance'}
        {bloc.mesure === 'duree' ? (
          <ChampTexteValide
            value={bloc.valeur}
            onChange={(valeur) => changer({ valeur })}
            formater={formaterChrono}
            lire={lireChrono}
            placeholder="ex. 10:00"
          />
        ) : (
          <ChampTexteValide
            value={bloc.valeur}
            onChange={(valeur) => changer({ valeur })}
            formater={formaterDistance}
            lire={lireDistance}
            placeholder="ex. 400 m, 1,5 km"
          />
        )}
      </label>
      <label>
        Cible
        <select
          value={cible.type}
          onChange={(e) => changer({ cible: cibleParDefaut(e.target.value) })}
        >
          {CIBLES_PAR_SPORT[sport].map((type) => (
            <option key={type} value={type}>
              {LIBELLES_CIBLE[type]}
            </option>
          ))}
        </select>
      </label>
      {cible.type !== 'aucune' && <ChampsCible cible={cible} onChange={changerCible} />}
      <label className="champ-large">
        Note
        <input
          value={bloc.note ?? ''}
          onChange={(e) => changer({ note: e.target.value })}
          maxLength={200}
          placeholder="facultatif (ex. en côte)"
        />
      </label>
    </div>
  );
}

// Valeur de la cible : une valeur, ou une fourchette si "à" est rempli
function ChampsCible({ cible, onChange }) {
  if (cible.type === 'zone') {
    const zones = [1, 2, 3, 4, 5];
    return (
      <>
        <label className="champ-court">
          Zone
          <select value={cible.min} onChange={(e) => onChange({ min: Number(e.target.value) })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                Z{z}
              </option>
            ))}
          </select>
        </label>
        <label className="champ-court">
          à (option)
          <select
            value={cible.max ?? ''}
            onChange={(e) => onChange({ max: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">—</option>
            {zones
              .filter((z) => z > cible.min)
              .map((z) => (
                <option key={z} value={z}>
                  Z{z}
                </option>
              ))}
          </select>
        </label>
      </>
    );
  }

  if (cible.type === 'allure') {
    return (
      <>
        <label className="champ-court">
          Allure
          <ChampTexteValide
            value={cible.min}
            onChange={(min) => onChange({ min })}
            formater={formaterChrono}
            lire={lireChrono}
            placeholder="4:30"
          />
        </label>
        <label className="champ-court">
          à (option)
          <ChampTexteValide
            value={cible.max ?? null}
            onChange={(max) => onChange({ max })}
            formater={formaterChrono}
            lire={lireChrono}
            optionnel
            placeholder="4:40"
          />
        </label>
      </>
    );
  }

  // Puissance en watts
  const lireEntier = (v) => (v === '' ? null : Number(v));
  return (
    <>
      <label className="champ-court">
        Watts
        <input
          type="number"
          min={30}
          max={2000}
          value={cible.min ?? ''}
          onChange={(e) => onChange({ min: lireEntier(e.target.value) })}
        />
      </label>
      <label className="champ-court">
        à (option)
        <input
          type="number"
          min={30}
          max={2000}
          value={cible.max ?? ''}
          onChange={(e) => onChange({ max: lireEntier(e.target.value) })}
        />
      </label>
    </>
  );
}
