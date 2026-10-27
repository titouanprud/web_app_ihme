// Erreur "prévue" à renvoyer au client avec un code HTTP et un message clair.
// Exemple : throw new HttpError(404, 'Séance introuvable.')
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
