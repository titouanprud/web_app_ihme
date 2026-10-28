import { TYPES_BLOC, formaterCible, formaterMesure, resumerTotaux } from '../blocs.js';

// Affichage en lecture seule de la structure d'une séance (côté athlète et coach).
export default function BlocsAffichage({ blocs }) {
  if (!blocs?.length) return null;
  return (
    <div className="blocs-affichage">
      <div className="blocs-affichage-entete">
        <h3>Structure de la séance</h3>
        <span className="texte-discret">{resumerTotaux(blocs)}</span>
      </div>
      <ListeLecture blocs={blocs} />
    </div>
  );
}

function ListeLecture({ blocs }) {
  return (
    <ol className="blocs-lecture">
      {blocs.map((bloc, i) =>
        bloc.type === 'repetition' ? (
          <li key={i} className="bloc-lecture bloc-repetition">
            <strong>{bloc.repetitions} ×</strong>
            <ListeLecture blocs={bloc.blocs} />
          </li>
        ) : (
          <li key={i} className={`bloc-lecture bloc-${bloc.type}`}>
            <span className="bloc-lecture-type">{TYPES_BLOC[bloc.type]}</span>
            <span>
              <strong>{formaterMesure(bloc)}</strong>
              {formaterCible(bloc.cible) && ` · ${formaterCible(bloc.cible)}`}
            </span>
            {bloc.note && <span className="texte-discret">{bloc.note}</span>}
          </li>
        ),
      )}
    </ol>
  );
}
