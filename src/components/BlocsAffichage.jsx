import {
  TYPES_BLOC,
  estimerBloc,
  formaterChrono,
  formaterCible,
  formaterDistance,
  formaterDplus,
  formaterMesure,
  resumerTotaux,
} from '../blocs.js';

// Estimation affichée à côté d'un bloc qui a une allure :
// la distance d'un bloc en durée (≈ 2,4 km), la durée d'un bloc en distance (≈ 4:12).
function estimationDuBloc(bloc) {
  const { duree, distance } = estimerBloc(bloc);
  if (bloc.mesure === 'duree' && distance !== null) return `≈ ${formaterDistance(distance)}`;
  if (bloc.mesure === 'distance' && duree !== null) return `≈ ${formaterChrono(Math.round(duree))}`;
  return '';
}

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
              {bloc.cible?.modifiee && (
                <abbr className="marque-modifiee" title="Allure modifiée par le coach">
                  *
                </abbr>
              )}
              {bloc.dplus > 0 && ` · ${formaterDplus(bloc.dplus)}`}
              {estimationDuBloc(bloc) && (
                <span className="texte-discret"> ({estimationDuBloc(bloc)})</span>
              )}
            </span>
            {bloc.note && <span className="texte-discret">{bloc.note}</span>}
          </li>
        ),
      )}
    </ol>
  );
}
