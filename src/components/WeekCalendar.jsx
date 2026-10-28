import { libelleSport } from '../blocs.js';
import { ajouterJours, debutSemaine, formaterDate, toISODate } from '../dates.js';
import { formaterDuree, libelleType, STATUTS } from '../libelles.js';

export function StatusBadge({ statut }) {
  return <span className={`badge badge-${statut}`}>{STATUTS[statut]}</span>;
}

// Navigation entre les semaines : précédente, actuelle, suivante.
export function WeekNav({ lundi, onChange }) {
  const dimanche = ajouterJours(lundi, 6);
  return (
    <div className="week-nav">
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange(ajouterJours(lundi, -7))}
      >
        ← <span className="hide-mobile">Semaine précédente</span>
      </button>
      <div className="week-nav-centre">
        <strong>
          {formaterDate(lundi, { day: 'numeric', month: 'short' })} –{' '}
          {formaterDate(dimanche, { day: 'numeric', month: 'short', year: 'numeric' })}
        </strong>
        {lundi !== debutSemaine() && (
          <button type="button" className="btn-lien" onClick={() => onChange(debutSemaine())}>
            Revenir à cette semaine
          </button>
        )}
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange(ajouterJours(lundi, 7))}
      >
        <span className="hide-mobile">Semaine suivante</span> →
      </button>
    </div>
  );
}

// Calendrier de la semaine : une colonne par jour (une ligne par jour sur mobile).
// onAjouter est optionnel : s'il est fourni (coach), un bouton "+" apparaît sur chaque jour.
export default function WeekCalendar({ lundi, seances, loading, onOuvrir, onAjouter }) {
  const aujourdhui = toISODate(new Date());
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));

  return (
    <div className={`calendrier${loading ? ' calendrier-chargement' : ''}`} aria-busy={loading}>
      {jours.map((jour) => {
        const duJour = seances.filter((s) => s.date === jour);
        return (
          <section key={jour} className={`jour${jour === aujourdhui ? ' jour-aujourdhui' : ''}`}>
            <header className="jour-entete">
              <span className="jour-nom">{formaterDate(jour, { weekday: 'short' })}</span>
              <span className="jour-num">
                {formaterDate(jour, { day: 'numeric', month: 'short' })}
              </span>
              {onAjouter && (
                <button
                  type="button"
                  className="btn-ajouter"
                  onClick={() => onAjouter(jour)}
                  aria-label={`Ajouter une séance le ${formaterDate(jour)}`}
                >
                  +
                </button>
              )}
            </header>
            <div className="jour-seances">
              {duJour.length === 0 && <p className="jour-vide">—</p>}
              {duJour.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`carte-seance type-${s.type}`}
                  onClick={() => onOuvrir(s)}
                >
                  <span className="carte-titre">{s.titre}</span>
                  <span className="carte-infos">
                    {libelleSport(s.sport)} · {libelleType(s.type)}
                    {s.dureePrevueMin !== null && ` · ${formaterDuree(s.dureePrevueMin)}`}
                  </span>
                  <StatusBadge statut={s.statut} />
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
