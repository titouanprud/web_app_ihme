import { Link, Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth.jsx';
import { Loading } from './components/Feedback.jsx';
import Layout from './components/Layout.jsx';
import RequireRole from './components/RequireRole.jsx';
import AthletePage from './pages/AthletePage.jsx';
import BibliothequePage from './pages/BibliothequePage.jsx';
import CoachAthletePage from './pages/CoachAthletePage.jsx';
import CoachDashboard from './pages/CoachDashboard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { AthleteMessagesPage, CoachMessagesPage } from './pages/MessagesPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';

// Page d'accueil : envoie vers l'espace coach, l'espace athlète ou la connexion.
function Accueil() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/connexion" replace />;
  return <Navigate to={user.role === 'coach' ? '/coach' : '/athlete'} replace />;
}

function PageIntrouvable() {
  return (
    <div className="page">
      <h1>Page introuvable</h1>
      <Link to="/">Retour à l’accueil</Link>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Accueil />} />
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/inscription" element={<RegisterPage />} />
        <Route
          path="/coach"
          element={
            <RequireRole role="coach">
              <CoachDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/coach/athletes/:athleteId"
          element={
            <RequireRole role="coach">
              <CoachAthletePage />
            </RequireRole>
          }
        />
        <Route
          path="/athlete"
          element={
            <RequireRole role="athlete">
              <AthletePage />
            </RequireRole>
          }
        />
        <Route
          path="/coach/athletes/:athleteId/messages"
          element={
            <RequireRole role="coach">
              <CoachMessagesPage />
            </RequireRole>
          }
        />
        <Route
          path="/bibliotheque"
          element={
            <RequireRole role="coach">
              <BibliothequePage />
            </RequireRole>
          }
        />
        <Route
          path="/athlete/messages"
          element={
            <RequireRole role="athlete">
              <AthleteMessagesPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<PageIntrouvable />} />
      </Route>
    </Routes>
  );
}
