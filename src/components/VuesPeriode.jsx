import { Fragment } from 'react';
import { libelleSport } from '../blocs.js';
import {
  additionnerTotaux,
  moisDeLaPeriode,
  moisDeLaSemaine,
  semainesDeLaGrille,
} from '../calendrier.js';
import { ajouterJours, formaterDate, toISODate } from '../dates.js';
import { dureeSeanceMin, formaterDuree, STATUTS } from '../libelles.js';
import { BandeauCycle, cycleDuJour } from './Cycles.jsx';
import { ZoneJour } from './GlisserDeposer.jsx';
import Totaux from './Totaux.jsx';
import { BoutonAjouter, CarteSeance } from './WeekCalendar.jsx';

const NOMS_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const joursDeLaSemaine = (lundi) => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
const nomDuMois = (iso) => formaterDate(iso, { month: 'long', year: 'numeric' });

// Bandeau avec le nom du cycle, au-dessus de sa première semaine (ou de la première semaine
// affichée). Chaque semaine du cycle a en plus une bordure gauche de sa couleur (rangeeCycle).
function CycleDeLaSemaine({ cycles, lundi, premiere, onOuvrirCycle }) {
  const cycle = cycleDuJour(cycles, lundi);
  if (!cycle || !(premiere || cycle.dateDebut === lundi)) return null;
  return <BandeauCycle cycle={cycle} onOuvrir={onOuvrirCycle} />;
}

// Classe et couleur d'une ligne de semaine qui fait partie d'un cycle
function rangeeCycle(cycles, lundi) {
  const cycle = cycleDuJour(cycles, lundi);
  return cycle
    ? { className: 'rangee rangee-cycle', style: { '--cycle': cycle.couleur } }
    : { className: 'rangee' };
}

// Vue Mois : une ligne par semaine (lundi → dimanche) avec ses totaux, puis le total du mois.
export function VueMois({
  periode,
  seances,
  totauxSemaines,
  totalMois,
  cycles,
  onOuvrir,
  onAjouter,
  onOuvrirCycle,
}) {
  const aujourdhui = toISODate(new Date());
  const lundis = semainesDeLaGrille(periode.grilleDebut, periode.grilleFin);

  return (
    <div className="defilement-x">
      <div className="grille-periode grille-mois">
        <div className="rangee rangee-entete">
          {NOMS_JOURS.map((nom) => (
            <span key={nom}>{nom}</span>
          ))}
          <span>Totaux</span>
        </div>
        {lundis.map((lundi, i) => (
          <Fragment key={lundi}>
            <CycleDeLaSemaine
              cycles={cycles}
              lundi={lundi}
              premiere={i === 0}
              onOuvrirCycle={onOuvrirCycle}
            />
            <div {...rangeeCycle(cycles, lundi)}>
              {joursDeLaSemaine(lundi).map((jour) => (
                <ZoneJour
                  key={jour}
                  jour={jour}
                  className={`case-jour${jour < periode.debut || jour > periode.fin ? ' hors-periode' : ''}${jour === aujourdhui ? ' jour-aujourdhui' : ''}`}
                >
                  <div className="case-jour-entete">
                    <span>{Number(jour.slice(8))}</span>
                    {onAjouter && <BoutonAjouter jour={jour} onAjouter={onAjouter} />}
                  </div>
                  {seances
                    .filter((s) => s.date === jour)
                    .map((s) => (
                      <CarteSeance key={s.id} seance={s} onOuvrir={onOuvrir} mini />
                    ))}
                </ZoneJour>
              ))}
              <div className="case-totaux">
                <Totaux t={totauxSemaines[lundi]} />
              </div>
            </div>
          </Fragment>
        ))}
        <div className="rangee rangee-total">
          <span className="libelle-total">Total {nomDuMois(periode.debut)}</span>
          <div className="case-totaux">
            <Totaux t={totalMois} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

// Pastille colorée d'une séance (vues Trimestre et Année) : détail au survol, ouverture au clic
function Pastille({ seance: s, onOuvrir }) {
  const duree = dureeSeanceMin(s) !== null ? ` · ${formaterDuree(dureeSeanceMin(s))}` : '';
  const detail = `${formaterDate(s.date, { day: 'numeric', month: 'short' })} · ${s.titre} · ${libelleSport(s.sport)}${duree} · ${STATUTS[s.statut]}`;
  return (
    <button
      type="button"
      className={`pastille sport-${s.sport} statut-${s.statut}`}
      title={detail}
      aria-label={detail}
      onClick={() => onOuvrir(s)}
    />
  );
}

// Vues Trimestre et Année : une ligne compacte par semaine (une pastille par séance),
// une ligne de sous-total par mois, et le total de la période.
// Une semaine à cheval sur deux mois est rangée dans le mois de son jeudi.
export function VueCompacte({
  periode,
  libelle,
  seances,
  totauxSemaines,
  totauxMois,
  cycles,
  onOuvrir,
  onOuvrirCycle,
}) {
  const aujourdhui = toISODate(new Date());
  const mois = moisDeLaPeriode(periode.debut, periode.fin);
  const lundis = semainesDeLaGrille(periode.grilleDebut, periode.grilleFin);

  // Mois de rattachement de chaque semaine, limité aux mois de la période
  const rattachement = (lundi) => {
    const m = moisDeLaSemaine(lundi);
    if (m < mois[0]) return mois[0];
    return m > mois.at(-1) ? mois.at(-1) : m;
  };

  return (
    <div className="defilement-x">
      <div className="grille-periode grille-compacte">
        <div className="rangee rangee-entete">
          <span>Semaine</span>
          {NOMS_JOURS.map((nom) => (
            <span key={nom}>{nom[0]}</span>
          ))}
          <span>Totaux</span>
        </div>
        {mois.map((m) => (
          <div key={m} className="groupe-mois">
            {lundis
              .filter((lundi) => rattachement(lundi) === m)
              .map((lundi) => (
                <Fragment key={lundi}>
                  <CycleDeLaSemaine
                    cycles={cycles}
                    lundi={lundi}
                    premiere={lundi === lundis[0]}
                    onOuvrirCycle={onOuvrirCycle}
                  />
                  <div {...rangeeCycle(cycles, lundi)}>
                    <span className="semaine-libelle">
                      {formaterDate(lundi, { day: 'numeric', month: 'short' })}
                    </span>
                    {joursDeLaSemaine(lundi).map((jour) => (
                      <ZoneJour
                        key={jour}
                        jour={jour}
                        className={`case-mini${jour === aujourdhui ? ' jour-aujourdhui' : ''}`}
                        title={formaterDate(jour)}
                      >
                        {seances
                          .filter((s) => s.date === jour)
                          .map((s) => (
                            <Pastille key={s.id} seance={s} onOuvrir={onOuvrir} />
                          ))}
                      </ZoneJour>
                    ))}
                    <div className="case-totaux">
                      <Totaux t={totauxSemaines[lundi]} compact />
                    </div>
                  </div>
                </Fragment>
              ))}
            <div className="rangee rangee-sous-total">
              <span className="libelle-total">Sous-total {nomDuMois(m)}</span>
              <div className="case-totaux">
                <Totaux t={totauxMois[m]} compact />
              </div>
            </div>
          </div>
        ))}
        <div className="rangee rangee-total">
          <span className="libelle-total">Total {libelle}</span>
          <div className="case-totaux">
            <Totaux t={additionnerTotaux(mois.map((m) => totauxMois[m]))} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
