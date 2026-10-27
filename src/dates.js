// Outils de dates. Les dates circulent sous forme de texte "AAAA-MM-JJ",
// comme dans la base, pour éviter les problèmes de fuseau horaire.

export function toISODate(date) {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mois}-${jour}`;
}

export function parseISODate(iso) {
  const [annee, mois, jour] = iso.split('-').map(Number);
  return new Date(annee, mois - 1, jour);
}

// Lundi de la semaine contenant la date donnée
export function debutSemaine(date = new Date()) {
  const lundi = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  return toISODate(lundi);
}

export function ajouterJours(iso, nombre) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + nombre);
  return toISODate(date);
}

export function formaterDate(iso, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return parseISODate(iso).toLocaleDateString('fr-FR', options);
}
