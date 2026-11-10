import { useSearchParams } from 'react-router';
import {
  VUES,
  contientAujourdhui,
  decaler,
  indexerParPeriode,
  libellePeriode,
  periodeAffichee,
} from '../calendrier.js';
import { formaterDate, toISODate } from '../dates.js';
import { useApi } from '../useApi.js';
import { ErrorMessage } from './Feedback.jsx';
import { GlisserDeposerActif, ZoneJour } from './GlisserDeposer.jsx';
import SeanceDetails from './SeanceDetails.jsx';
import { VueCompacte, VueMois } from './VuesPeriode.jsx';
import WeekCalendar, { BoutonAjouter } from './WeekCalendar.jsx';

const estDateISO = (texte) => /^\d{4}-\d{2}-\d{2}$/.test(texte ?? '') && !isNaN(Date.parse(texte));

// Vue et date affichées, gardées dans l'adresse (ex. ?vue=mois&date=2026-11-10) :
// un rechargement de la page ou un lien partagé ouvre le calendrier au même endroit.
export function useVueCalendrier() {
  const [params, setParams] = useSearchParams();
  const vue = VUES.some((v) => v.value === params.get('vue')) ? params.get('vue') : 'semaine';
  const date = estDateISO(params.get('date')) ? params.get('date') : toISODate(new Date());
  const aller = (nouvelleVue, nouvelleDate) =>
    setParams({ vue: nouvelleVue, date: nouvelleDate }, { replace: true });
  return { vue, date, aller };
}

// Calendrier complet : choix de la vue, navigation, séances et totaux de la période.
// - athleteId : obligatoire côté coach (son athlète ou lui-même), absent côté athlète ;
// - version : à augmenter après une modification pour tout recharger ;
// - onOuvrir(seance) : clic sur une séance ; onAjouter(date) : optionnel (coach) ;
// - glisserDeposer : true pour déposer des modèles et déplacer les séances (le <DndContext>
//   est fourni par la page, qui contient aussi le catalogue).
export default function Calendrier({
  athleteId,
  version = 0,
  onOuvrir,
  onAjouter,
  glisserDeposer = false,
}) {
  const { vue, date, aller } = useVueCalendrier();
  const aujourdhui = toISODate(new Date());
  const periode = periodeAffichee(vue, date);
  const libelle = libellePeriode(vue, date);

  // Trois demandes au plus : les séances, les totaux par semaine et les totaux par mois
  const pour = athleteId ? `&athleteId=${athleteId}` : '';
  const grille = `from=${periode.grilleDebut}&to=${periode.grilleFin}${pour}`;
  const avecMois = ['mois', 'trimestre', 'annee'].includes(vue);
  const seances = useApi(`seances?${grille}`, version);
  const semaines = useApi(
    vue === 'jour' ? null : `seances/totaux?groupe=semaine&${grille}`,
    version,
  );
  const mois = useApi(
    avecMois ? `seances/totaux?groupe=mois&from=${periode.debut}&to=${periode.fin}${pour}` : null,
    version,
  );

  const liste = seances.data ?? [];
  const totauxSemaines = indexerParPeriode(semaines.data);
  const totauxMois = indexerParPeriode(mois.data);
  const loading = seances.loading || semaines.loading || mois.loading;

  return (
    <GlisserDeposerActif.Provider value={glisserDeposer}>
      <div className="cal">
        <div className="cal-barre">
          <div className="cal-vues" role="group" aria-label="Vue du calendrier">
            {VUES.map((v) => (
              <button
                key={v.value}
                type="button"
                className={`cal-vue${v.value === vue ? ' cal-vue-active' : ''}`}
                aria-pressed={v.value === vue}
                onClick={() => aller(v.value, date)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="cal-nav">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => aller(vue, decaler(vue, date, -1))}
              aria-label="Période précédente"
            >
              ←
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => aller(vue, aujourdhui)}
              disabled={contientAujourdhui(vue, date, aujourdhui)}
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => aller(vue, decaler(vue, date, 1))}
              aria-label="Période suivante"
            >
              →
            </button>
            <strong className="cal-titre">{libelle}</strong>
          </div>
        </div>

        <ErrorMessage message={seances.error || semaines.error || mois.error} />

        <div className={loading ? 'calendrier-chargement' : ''} aria-busy={loading}>
          {vue === 'jour' && (
            <VueJour jour={date} seances={liste} onOuvrir={onOuvrir} onAjouter={onAjouter} />
          )}
          {vue === 'semaine' && (
            <WeekCalendar
              lundi={periode.debut}
              seances={liste}
              totaux={totauxSemaines[periode.debut]}
              onOuvrir={onOuvrir}
              onAjouter={onAjouter}
            />
          )}
          {vue === 'mois' && (
            <VueMois
              periode={periode}
              seances={liste}
              totauxSemaines={totauxSemaines}
              totalMois={totauxMois[periode.debut]}
              onOuvrir={onOuvrir}
              onAjouter={onAjouter}
            />
          )}
          {(vue === 'trimestre' || vue === 'annee') && (
            <VueCompacte
              periode={periode}
              libelle={libelle}
              seances={liste}
              totauxSemaines={totauxSemaines}
              totauxMois={totauxMois}
              onOuvrir={onOuvrir}
            />
          )}
        </div>
      </div>
    </GlisserDeposerActif.Provider>
  );
}

// Vue Jour : le détail complet de chaque séance du jour
function VueJour({ jour, seances, onOuvrir, onAjouter }) {
  const duJour = seances.filter((s) => s.date === jour);
  return (
    <ZoneJour jour={jour} className="vue-jour">
      {onAjouter && (
        <div className="vue-jour-actions">
          <BoutonAjouter jour={jour} onAjouter={onAjouter} />
          <span className="texte-discret">Ajouter une séance</span>
        </div>
      )}
      {duJour.length === 0 && <p className="vide">Aucune séance le {formaterDate(jour)}.</p>}
      {duJour.map((s) => (
        <article key={s.id} className="carte vue-jour-seance">
          <div className="vue-jour-entete">
            <h2>{s.titre}</h2>
            <button type="button" className="btn btn-ghost btn-petit" onClick={() => onOuvrir(s)}>
              Ouvrir
            </button>
          </div>
          <SeanceDetails seance={s} />
        </article>
      ))}
    </ZoneJour>
  );
}
