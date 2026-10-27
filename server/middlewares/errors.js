import { HttpError } from '../errors.js';

// Toute route /api/... qui n'existe pas renvoie un 404 en JSON.
export function apiNotFound(_req, res) {
  res.status(404).json({ error: 'Route introuvable.' });
}

// Gestion centralisée des erreurs : Express appelle ce middleware (4 paramètres)
// dès qu'une route lève une erreur. Le client reçoit un message clair ;
// les détails techniques restent dans les journaux du serveur.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "Le corps de la requête n'est pas un JSON valide." });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Les données envoyées sont trop volumineuses.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur. Réessayez plus tard.' });
}
