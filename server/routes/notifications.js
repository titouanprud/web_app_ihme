import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// GET /api/notifications : compteurs affichés dans l'en-tête, interrogés régulièrement.
// - messagesNonLus : total des messages reçus non lus ;
// - parAthlete : (coach) messages non lus par athlète, ex. { "12": 3 } ;
// - demandesEnAttente : (coach) nombre de demandes à traiter.
router.get('/', requireAuth, async (req, res) => {
  const estCoach = req.user.role === 'coach';
  // Nom de colonne choisi parmi deux valeurs fixes (jamais une donnée reçue du client)
  const colonne = estCoach ? 'coach_id' : 'athlete_id';

  const { rows } = await pool.query(
    `SELECT athlete_id AS "athleteId", count(*)::int AS nombre
     FROM messages
     WHERE ${colonne} = $1 AND auteur_id <> $1 AND NOT lu
     GROUP BY athlete_id`,
    [req.user.id],
  );
  const parAthlete = Object.fromEntries(rows.map((r) => [r.athleteId, r.nombre]));
  const messagesNonLus = rows.reduce((total, r) => total + r.nombre, 0);

  let demandesEnAttente = 0;
  if (estCoach) {
    const resultat = await pool.query(
      `SELECT count(*)::int AS nombre FROM coach_athletes
       WHERE coach_id = $1 AND statut = 'en_attente'`,
      [req.user.id],
    );
    demandesEnAttente = resultat.rows[0].nombre;
  }

  res.json({ messagesNonLus, parAthlete: estCoach ? parAthlete : {}, demandesEnAttente });
});

export default router;
