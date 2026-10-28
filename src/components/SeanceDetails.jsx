import { libelleSport } from '../blocs.js';
import { formaterDate } from '../dates.js';
import { formaterDuree, libelleType } from '../libelles.js';
import BlocsAffichage from './BlocsAffichage.jsx';
import { StatusBadge } from './WeekCalendar.jsx';

// Détail d'une séance et du retour de l'athlète (lecture seule).
export default function SeanceDetails({ seance }) {
  const { retour } = seance;
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
          <dt>Durée prévue</dt>
          <dd>{formaterDuree(seance.dureePrevueMin) ?? '—'}</dd>
        </div>
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
          <h3>Retour de l’athlète</h3>
          <dl className="details-liste">
            <div>
              <dt>Ressenti</dt>
              <dd>{retour.ressenti ? `${retour.ressenti} / 10` : '—'}</dd>
            </div>
            <div>
              <dt>Durée réelle</dt>
              <dd>{formaterDuree(retour.dureeReelleMin) ?? '—'}</dd>
            </div>
          </dl>
          {retour.commentaire && <p className="retour-commentaire">« {retour.commentaire} »</p>}
        </div>
      )}
    </div>
  );
}
