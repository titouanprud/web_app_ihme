import { HttpError } from '../errors.js';
import { verifyToken } from '../jwt.js';

// Vérifie le jeton envoyé dans l'en-tête "Authorization: Bearer <jeton>"
// et place l'utilisateur connecté dans req.user = { id, role }.
export function requireAuth(req, _res, next) {
  const [type, token] = (req.headers.authorization ?? '').split(' ');
  if (type !== 'Bearer' || !token) {
    throw new HttpError(401, 'Vous devez être connecté.');
  }
  try {
    req.user = verifyToken(token);
  } catch {
    throw new HttpError(401, 'Session expirée ou invalide, veuillez vous reconnecter.');
  }
  next();
}

// À placer après requireAuth : n'autorise que le rôle indiqué ("coach" ou "athlete").
export function requireRole(role) {
  return (req, _res, next) => {
    if (req.user.role !== role) {
      const libelle = role === 'coach' ? 'aux coachs' : 'aux athlètes';
      throw new HttpError(403, `Cette action est réservée ${libelle}.`);
    }
    next();
  };
}
