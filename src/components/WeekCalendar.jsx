import { formaterDplus, libelleSport } from '../blocs.js';
import { ajouterJours, formaterDate, toISODate } from '../dates.js';
import { dureeSeanceMin, formaterDuree, libelleType, STATUTS } from '../libelles.js';
import { Deplacable, ZoneJour } from './GlisserDeposer.jsx';
import Totaux from './Totaux.jsx';

export function StatusBadge({ statut }) {
  return <span className={`badge badge-${statut}`}>{STATUTS[statut]}</span>;
}

// Carte d'une séance dans le calendrier. mini : version réduite (vue Mois).
// Sur le calendrier de planification, la carte se glisse sur un autre jour pour déplacer la séance.
export function CarteSeance({ seance: s, onOuvrir, mini = false }) {
  return (
    <Deplacable id={`seance-${s.id}`} data={{ type: 'seance', seance: s }}>
      <BoutonSeance seance={s} onOuvrir={onOuvrir} mini={mini} />
    </Deplacable>
  );
}

function BoutonSeance({ seance: s, onOuvrir, mini }) {
  return (
    <button
      type="button"
      className={`carte-seance type-${s.type}${mini ? ' carte-mini' : ''}`}
      onClick={() => onOuvrir(s)}
      title={mini ? `${s.titre} · ${libelleSport(s.sport)}` : undefined}
    >
      <span className="carte-titre">{s.titre}</span>
      {mini ? (
        <span className="carte-infos">
          {libelleSport(s.sport)}
          {dureeSeanceMin(s) !== null && ` · ${formaterDuree(dureeSeanceMin(s))}`}
        </span>
      ) : (
        <>
          <span className="carte-infos">
            {libelleSport(s.sport)} · {libelleType(s.type)}
            {dureeSeanceMin(s) !== null && ` · ${formaterDuree(dureeSeanceMin(s))}`}
            {s.dplusPrevuM > 0 && ` · ${formaterDplus(s.dplusPrevuM)}`}
          </span>
          <StatusBadge statut={s.statut} />
        </>
      )}
    </button>
  );
}

// Bouton "+" pour ajouter une séance un jour donné (coach seulement)
export function BoutonAjouter({ jour, onAjouter }) {
  return (
    <button
      type="button"
      className="btn-ajouter"
      onClick={() => onAjouter(jour)}
      aria-label={`Ajouter une séance le ${formaterDate(jour)}`}
    >
      +
    </button>
  );
}

// Vue Semaine : une colonne par jour (une ligne par jour sur mobile) et une colonne de totaux.
// onAjouter est optionnel : s'il est fourni (coach), un bouton "+" apparaît sur chaque jour.
export default function WeekCalendar({ lundi, seances, totaux, loading, onOuvrir, onAjouter }) {
  const aujourdhui = toISODate(new Date());
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));

  return (
    <div
      className={`calendrier calendrier-semaine${loading ? ' calendrier-chargement' : ''}`}
      aria-busy={loading}
    >
      {jours.map((jour) => {
        const duJour = seances.filter((s) => s.date === jour);
        return (
          <ZoneJour
            key={jour}
            jour={jour}
            className={`jour${jour === aujourdhui ? ' jour-aujourdhui' : ''}`}
          >
            <header className="jour-entete">
              <span className="jour-nom">{formaterDate(jour, { weekday: 'short' })}</span>
              <span className="jour-num">
                {formaterDate(jour, { day: 'numeric', month: 'short' })}
              </span>
              {onAjouter && <BoutonAjouter jour={jour} onAjouter={onAjouter} />}
            </header>
            <div className="jour-seances">
              {duJour.length === 0 && <p className="jour-vide">—</p>}
              {duJour.map((s) => (
                <CarteSeance key={s.id} seance={s} onOuvrir={onOuvrir} />
              ))}
            </div>
          </ZoneJour>
        );
      })}
      <aside className="jour jour-totaux" aria-label="Totaux de la semaine">
        <header className="jour-entete">
          <span className="jour-nom">Totaux</span>
          <span className="jour-num">prévu</span>
        </header>
        <div className="jour-seances">
          <Totaux t={totaux} />
        </div>
      </aside>
    </div>
  );
}
