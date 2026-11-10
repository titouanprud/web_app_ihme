import { libelleSport } from '../blocs.js';
import {
  additionnerTotaux,
  moisDeLaPeriode,
  moisDeLaSemaine,
  semainesDeLaGrille,
} from '../calendrier.js';
import { ajouterJours, formaterDate, toISODate } from '../dates.js';
import { dureeSeanceMin, formaterDuree, STATUTS } from '../libelles.js';
import { ZoneJour } from './GlisserDeposer.jsx';
import Totaux from './Totaux.jsx';
import { BoutonAjouter, CarteSeance } from './WeekCalendar.jsx';

const NOMS_JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const joursDeLaSemaine = (lundi) => Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
const nomDuMois = (iso) => formaterDate(iso, { month: 'long', year: 'numeric' });

// Vue Mois : une ligne par semaine (lundi → dimanche) avec ses totaux, puis le total du mois.
export function VueMois({ periode, seances, totauxSemaines, totalMois, onOuvrir, onAjouter }) {
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
        {lundis.map((lundi) => (
          <div key={lundi} className="rangee">
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
export function VueCompacte({ periode, libelle, seances, totauxSemaines, totauxMois, onOuvrir }) {
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
                <div key={lundi} className="rangee">
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
