import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorMessage } from '../components/Feedback.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const [valeurs, setValeurs] = useState({ email: '', motDePasse: '' });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  // Déjà connecté : la page d'accueil redirige vers le bon espace
  if (user) return <Navigate to="/" replace />;

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const { token } = await api('auth/login', { method: 'POST', body: valeurs });
      await login(token);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="carte auth-carte">
        <h1>Connexion</h1>
        <p className="sous-titre">Planifiez et suivez vos entraînements.</p>
        <form className="form" onSubmit={envoyer}>
          <ErrorMessage message={erreur} />
          <label>
            Email
            <input
              type="email"
              name="email"
              value={valeurs.email}
              onChange={changer}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              name="motDePasse"
              value={valeurs.motDePasse}
              onChange={changer}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-large" disabled={envoi}>
            {envoi ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
        <p className="auth-lien">
          Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}
