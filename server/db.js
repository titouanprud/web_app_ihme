import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('La variable DATABASE_URL est manquante (voir .env.example).');
  process.exit(1);
}

// Les colonnes de type DATE sont renvoyées telles quelles ("2026-10-27") plutôt
// qu'en objet Date JavaScript, pour éviter les décalages de fuseau horaire.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (valeur) => valeur);

// Pool = réserve de connexions réutilisées entre les requêtes.
// Le serveur du cours impose au maximum 4 connexions par application.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 4,
});

// Une connexion inactive qui tombe ne doit pas arrêter le serveur.
pool.on('error', (err) => {
  console.error('Erreur PostgreSQL sur une connexion inactive :', err.message);
});
