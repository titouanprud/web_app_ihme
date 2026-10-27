import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { loadJwtSecret } from './jwt.js';

const PORT = Number(process.env.PORT) || 3000;
const ESSAIS_MAX = 10;

// Au démarrage, la base peut ne pas être encore prête : on réessaie quelques fois.
async function preparerBase() {
  for (let essai = 1; ; essai++) {
    try {
      await migrate();
      await loadJwtSecret();
      return;
    } catch (err) {
      if (essai === ESSAIS_MAX) throw err;
      console.warn(`Base indisponible (essai ${essai}/${ESSAIS_MAX}), nouvel essai dans 3 s…`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

try {
  await preparerBase();
} catch (err) {
  console.error('Impossible de préparer la base de données :', err.message);
  process.exit(1);
}

// 0.0.0.0 : le serveur accepte les connexions venant de l'extérieur du conteneur.
createApp().listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
});
