// Petits composants d'état affichés partout dans l'application.

export function Loading({ texte = 'Chargement…' }) {
  return (
    <p className="loading" role="status">
      {texte}
    </p>
  );
}

export function ErrorMessage({ message }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

// Pastille avec un nombre (messages non lus, demandes…). Rien si le nombre vaut 0.
export function Compteur({ nombre, libelle }) {
  if (!nombre) return null;
  return (
    <span className="compteur" aria-label={`${nombre} ${libelle}`}>
      {nombre}
    </span>
  );
}
