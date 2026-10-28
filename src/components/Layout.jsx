import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth.jsx';
import { useNotifications } from '../notifications.js';
import { Compteur } from './Feedback.jsx';
import HealthStatus from './HealthStatus.jsx';

// Structure commune à toutes les pages : en-tête, contenu, pied de page.
export default function Layout() {
  const { user, logout } = useAuth();
  const notifs = useNotifications(user?.id);

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            CoachPlan
          </Link>
          {user && (
            <nav className="header-nav">
              {user.role === 'coach' ? (
                <>
                  <NavLink to="/coach">
                    Mes athlètes
                    <Compteur
                      nombre={(notifs?.demandesEnAttente ?? 0) + (notifs?.messagesNonLus ?? 0)}
                      libelle="nouveautés"
                    />
                  </NavLink>
                  <NavLink to="/bibliotheque">Bibliothèque</NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/athlete" end>
                    Programme
                  </NavLink>
                  {user.coach && (
                    <NavLink to="/athlete/messages">
                      Messages
                      <Compteur nombre={notifs?.messagesNonLus} libelle="messages non lus" />
                    </NavLink>
                  )}
                  <NavLink to="/athlete/profil">Profil</NavLink>
                </>
              )}
            </nav>
          )}
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
