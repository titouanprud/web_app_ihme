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
