import { useEffect, useState } from 'react';

// Affiche dans le pied de page le résultat de GET /api/health.
export default function HealthStatus() {
  const [statut, setStatut] = useState('verification');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/health`)
      .then((res) => res.json())
      .then((data) => setStatut(data.status === 'ok' ? 'ok' : 'indisponible'))
      .catch(() => setStatut('indisponible'));
  }, []);

  const textes = {
    verification: 'Vérification du serveur…',
    ok: 'Serveur et base de données opérationnels',
    indisponible: 'Serveur ou base de données indisponible',
  };
  return (
    <span className={`health health-${statut}`}>
      <span className="health-point" aria-hidden="true" />
      {textes[statut]}
    </span>
  );
}
