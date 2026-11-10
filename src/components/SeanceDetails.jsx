import { formaterDistance, formaterDplus, libelleSport, totaux } from '../blocs.js';
import { formaterDate } from '../dates.js';
import { dureeSeanceMin, formaterDuree, libelleType } from '../libelles.js';
import BlocsAffichage from './BlocsAffichage.jsx';
import { StatusBadge } from './WeekCalendar.jsx';

// Détail d'une séance et du retour de l'athlète (lecture seule).
export default function SeanceDetails({ seance }) {
  const { retour } = seance;
  // Distance estimée à partir des blocs (avec les allures), "≥" si incomplète
  const t = totaux(seance.blocs ?? []);
  return (
    <div className="details">
      <p className="details-date">{formaterDate(seance.date)}</p>
      <dl className="details-liste">
        <div>
          <dt>Sport</dt>
          <dd>{libelleSport(seance.sport)}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{libelleType(seance.type)}</dd>
        </div>
        <div>
          <dt>Durée</dt>
          <dd>{formaterDuree(dureeSeanceMin(seance)) ?? '—'}</dd>
        </div>
        {t.distance > 0 && (
          <div>
            <dt>Distance estimée</dt>
            <dd>
              {t.distanceComplete ? '' : '≥ '}
              {formaterDistance(t.distance)}
            </dd>
          </div>
        )}
        {seance.dplusPrevuM > 0 && (
          <div>
            <dt>Dénivelé</dt>
            <dd>{formaterDplus(seance.dplusPrevuM)}</dd>
          </div>
        )}
        <div>
          <dt>Statut</dt>
          <dd>
            <StatusBadge statut={seance.statut} />
          </dd>
        </div>
      </dl>
      <BlocsAffichage blocs={seance.blocs} />
      {seance.description && <p className="details-description">{seance.description}</p>}

      {retour && (
        <div className="retour">
          <h3>Retour sur la séance</h3>
          <dl className="details-liste">
            <div>
              <dt>Difficulté</dt>
              <dd>{retour.difficulte ? `${retour.difficulte} / 10` : '—'}</dd>
            </div>
            <div>
              <dt>Forme</dt>
              <dd>{retour.forme ? `${retour.forme} / 10` : '—'}</dd>
            </div>
          </dl>
          {retour.commentaire && <p className="retour-commentaire">« {retour.commentaire} »</p>}
        </div>
      )}
    </div>
  );
}
