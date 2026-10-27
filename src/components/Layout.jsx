import { Link, Outlet } from 'react-router';
import { useAuth } from '../auth.jsx';
import HealthStatus from './HealthStatus.jsx';

// Structure commune à toutes les pages : en-tête, contenu, pied de page.
export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            CoachPlan
          </Link>
          {user && (
            <div className="header-user">
              <span className="header-name">
                {user.prenom} {user.nom}
                <span className="role-tag">{user.role === 'coach' ? 'Coach' : 'Athlète'}</span>
              </span>
              <button type="button" className="btn btn-ghost" onClick={logout}>
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <HealthStatus />
        <span>Données fictives · Projet IHME</span>
      </footer>
    </div>
  );
}
