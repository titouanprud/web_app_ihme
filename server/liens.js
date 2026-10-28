import { pool } from './db.js';
import { HttpError } from './errors.js';
import * as valider from './validation.js';

// Fonctions partagées sur le lien coach / athlète.
// Seul un lien au statut "acceptee" donne des droits (séances, messagerie).

// Vérifie que l'athlète fait bien partie du groupe du coach connecté.
export async function verifierAthleteDuCoach(coachId, athleteId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM coach_athletes
     WHERE coach_id = $1 AND athlete_id = $2 AND statut = 'acceptee'`,
    [coachId, athleteId],
  );
  if (rowCount === 0) throw new HttpError(403, 'Cet athlète ne fait pas partie de votre groupe.');
}

// Renvoie l'id du coach de l'athlète, ou une erreur 403 s'il n'en a pas encore.
export async function coachDeLAthlete(athleteId) {
  const { rows } = await pool.query(
    `SELECT coach_id FROM coach_athletes WHERE athlete_id = $1 AND statut = 'acceptee'`,
    [athleteId],
  );
  if (!rows[0]) throw new HttpError(403, 'Vous n’avez pas encore de coach.');
  return rows[0].coach_id;
}

// Renvoie le binôme { coachId, athleteId } de l'utilisateur connecté :
// - un coach précise l'athlète (athleteId), qui doit être dans son groupe ;
// - un athlète est toujours relié à son propre coach.
export async function binomeDe(user, athleteIdDemande) {
  if (user.role === 'coach') {
    const athleteId = valider.identifiant(athleteIdDemande, "L'athlète (athleteId)");
    await verifierAthleteDuCoach(user.id, athleteId);
    return { coachId: user.id, athleteId };
  }
  return { coachId: await coachDeLAthlete(user.id), athleteId: user.id };
}
