import { HttpError } from './errors.js';

// Petites fonctions de validation des données reçues.
// Chacune renvoie la valeur nettoyée ou lève une erreur 400 avec un message lisible.

function absent(valeur) {
  return valeur === undefined || valeur === null || valeur === '';
}

export function texte(valeur, libelle, { max = 200, optionnel = false } = {}) {
  if (absent(valeur)) {
    if (optionnel) return '';
    throw new HttpError(400, `${libelle} est obligatoire.`);
  }
  if (typeof valeur !== 'string') throw new HttpError(400, `${libelle} doit être un texte.`);
  const nettoye = valeur.trim();
  if (!nettoye && !optionnel) throw new HttpError(400, `${libelle} est obligatoire.`);
  if (nettoye.length > max) {
    throw new HttpError(400, `${libelle} ne doit pas dépasser ${max} caractères.`);
  }
  return nettoye;
}

export function entier(valeur, libelle, { min, max, optionnel = false } = {}) {
  if (absent(valeur)) {
    if (optionnel) return null;
    throw new HttpError(400, `${libelle} est obligatoire.`);
  }
  const nombre = Number(valeur);
  if (!Number.isInteger(nombre) || nombre < min || nombre > max) {
    throw new HttpError(400, `${libelle} doit être un nombre entier entre ${min} et ${max}.`);
  }
  return nombre;
}

// Identifiant reçu dans l'URL (ex. /api/seances/12)
export function identifiant(valeur, libelle = "L'identifiant") {
  return entier(valeur, libelle, { min: 1, max: 2147483647 });
}

export function choix(valeur, libelle, valeursPermises) {
  if (!valeursPermises.includes(valeur)) {
    throw new HttpError(400, `${libelle} doit valoir : ${valeursPermises.join(', ')}.`);
  }
  return valeur;
}

export function dateISO(valeur, libelle) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    throw new HttpError(400, `${libelle} doit être une date au format AAAA-MM-JJ.`);
  }
  // Refuse les dates impossibles comme 2026-02-31
  const date = new Date(`${valeur}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== valeur) {
    throw new HttpError(400, `${libelle} n'est pas une date valide.`);
  }
  return valeur;
}

export function email(valeur) {
  const nettoye = texte(valeur, "L'email", { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nettoye)) {
    throw new HttpError(400, "L'email n'est pas valide.");
  }
  return nettoye;
}

export function motDePasse(valeur) {
  if (typeof valeur !== 'string' || valeur.length < 8) {
    throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  }
  // bcrypt ne prend en compte que les 72 premiers octets
  if (Buffer.byteLength(valeur) > 72) {
    throw new HttpError(400, 'Le mot de passe est trop long (72 caractères maximum).');
  }
  return valeur;
}
