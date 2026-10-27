import { Navigate } from 'react-router';
import { useAuth } from '../auth.jsx';
import { Loading } from './Feedback.jsx';

// Protège une page : il faut être connecté, et avoir le bon rôle si "role" est précisé.
// (La vraie sécurité est côté serveur ; ceci évite seulement d'afficher une page inutile.)
export default function RequireRole({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/connexion" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}
