import { formaterDistance, formaterDplus, libelleSport, prefixeTotal, totaux } from '../blocs.js';
import { formaterDate } from '../dates.js';
import { dureeSeanceMin, formaterDuree, libelleType } from '../libelles.js';
import BlocsAffichage from './BlocsAffichage.jsx';
import { StatusBadge } from './WeekCalendar.jsx';

// Détail d'une séance et du retour de l'athlète (lecture seule).
export default function SeanceDetails({ seance }) {
  const { retour } = seance;
  // Distance estimée, enregistrée par le serveur avec le profil de l'athlète
  // (« ≈ » si une partie est indicative : bloc sans allure, séance sans bloc)
  const t = totaux(seance.blocs ?? [], { sport: seance.sport });
  const distance = seance.distanceEstimeeM ?? t.distance;
  const exacte = (seance.blocs ?? []).length > 0 && t.distanceComplete;
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
        {distance > 0 && (
          <div>
            <dt>Distance estimée</dt>
            <dd>
              {prefixeTotal(exacte, false)}
              {formaterDistance(distance)}
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
      <BlocsAffichage blocs={seance.blocs} sport={seance.sport} avecTotal={false} />
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
