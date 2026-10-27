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
