// Textes affichés pour les valeurs enregistrées sans accents dans la base.

export const TYPES_SEANCE = [
  { value: 'endurance', label: 'Endurance' },
  { value: 'fractionne', label: 'Fractionné' },
  { value: 'renfo', label: 'Renforcement' },
  { value: 'competition', label: 'Compétition' },
  { value: 'repos', label: 'Repos' },
  { value: 'autre', label: 'Autre' },
];

export function libelleType(type) {
  return TYPES_SEANCE.find((t) => t.value === type)?.label ?? type;
}

export const STATUTS = {
  prevue: 'Prévue',
  realisee: 'Réalisée',
  non_realisee: 'Non réalisée',
};

export function formaterDuree(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  if (h === 0) return `${min} min`;
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`;
}

// Durée d'une séance en minutes : la durée prévue saisie, sinon celle estimée à partir des blocs
export function dureeSeanceMin(seance) {
  if (seance.dureePrevueMin !== null && seance.dureePrevueMin !== undefined) {
    return seance.dureePrevueMin;
  }
  return seance.dureeEstimeeSec > 0 ? Math.round(seance.dureeEstimeeSec / 60) : null;
}

export const TYPES_CYCLE = [
  { value: 'preparation_generale', label: 'Préparation générale' },
  { value: 'specifique', label: 'Spécifique' },
  { value: 'affutage', label: 'Affûtage' },
  { value: 'recuperation', label: 'Récupération' },
  { value: 'competition', label: 'Compétition' },
  { value: 'autre', label: 'Autre' },
];

export function libelleTypeCycle(type) {
  return TYPES_CYCLE.find((t) => t.value === type)?.label ?? type;
}

// Couleurs proposées pour les bandeaux de cycle
export const COULEURS_CYCLE = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#64748b',
];
