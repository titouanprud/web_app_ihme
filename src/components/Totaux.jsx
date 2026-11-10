import { formaterDistance, formaterDplus } from '../blocs.js';
import { formaterDuree } from '../libelles.js';

const heures = (secondes) => formaterDuree(Math.round(secondes / 60));

// Lignes affichées : seulement les sports pratiqués sur la période.
// Chaque ligne = [libellé, libellé court (vues compactes), valeurs].
function lignesDesTotaux(t) {
  const lignes = [];
  const ajouter = (libelle, court, valeurs) => {
    const presentes = valeurs.filter(Boolean);
    if (presentes.length > 0) lignes.push([libelle, court, presentes.join(' · ')]);
  };
  ajouter('Course', 'CAP', [
    t.courseDistanceM > 0 && formaterDistance(t.courseDistanceM),
    t.courseDureeSec > 0 && heures(t.courseDureeSec),
  ]);
  ajouter('Vélo', 'Vélo', [
    t.veloDistanceM > 0 && formaterDistance(t.veloDistanceM),
    t.veloDureeSec > 0 && heures(t.veloDureeSec),
  ]);
  ajouter('Ski-alpi', 'Ski', [
    t.skiDureeSec > 0 && heures(t.skiDureeSec),
    t.skiDplusM > 0 && formaterDplus(t.skiDplusM),
  ]);
  ajouter('Renfo', 'Renfo', [t.renfoDureeSec > 0 && heures(t.renfoDureeSec)]);
  ajouter('D+ total', 'D+', [t.dplusM > 0 && formaterDplus(t.dplusM).replace('D+ ', '')]);
  return lignes;
}

// Totaux du prévu d'une période (semaine, mois, cycle…). t = une ligne de l'API, ou undefined.
// compact : une seule ligne courte, pour les vues Trimestre et Année.
export default function Totaux({ t, compact = false }) {
  if (!t || t.nombre === 0) return <span className="texte-discret">—</span>;
  const lignes = lignesDesTotaux(t);

  if (compact) {
    return (
      <span className="totaux-compact">
        {lignes.map(([libelle, court, valeurs]) => (
          <span key={libelle} title={libelle}>
            <strong>{court}</strong> {valeurs}
          </span>
        ))}
        <span>
          <strong>Total</strong> {heures(t.dureeSec)}
        </span>
      </span>
    );
  }
  return (
    <dl className="totaux">
      {lignes.map(([libelle, , valeurs]) => (
        <div key={libelle}>
          <dt>{libelle}</dt>
          <dd>{valeurs}</dd>
        </div>
      ))}
      <div className="totaux-total">
        <dt>Total sport</dt>
        <dd>{heures(t.dureeSec)}</dd>
      </div>
    </dl>
  );
}
