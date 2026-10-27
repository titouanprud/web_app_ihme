import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorMessage } from '../components/Feedback.jsx';

export default function RegisterPage() {
  const { user, login } = useAuth();
  const [valeurs, setValeurs] = useState({
    prenom: '',
    nom: '',
    email: '',
    motDePasse: '',
    role: 'athlete',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  if (user) return <Navigate to="/" replace />;

  const changer = (e) => setValeurs({ ...valeurs, [e.target.name]: e.target.value });

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const { token } = await api('auth/register', { method: 'POST', body: valeurs });
      await login(token);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="carte auth-carte">
        <h1>Créer un compte</h1>
        <p className="sous-titre">Utilisez uniquement des informations fictives.</p>
        <form className="form" onSubmit={envoyer}>
          <ErrorMessage message={erreur} />
          <fieldset className="choix-role">
            <legend>Je suis</legend>
            <label className={`choix-role-option${valeurs.role === 'athlete' ? ' actif' : ''}`}>
              <input
                type="radio"
                name="role"
                value="athlete"
                checked={valeurs.role === 'athlete'}
                onChange={changer}
              />
              <strong>Athlète</strong>
              <span>Je suis le programme de mon coach</span>
            </label>
            <label className={`choix-role-option${valeurs.role === 'coach' ? ' actif' : ''}`}>
              <input
                type="radio"
                name="role"
                value="coach"
                checked={valeurs.role === 'coach'}
                onChange={changer}
              />
              <strong>Coach</strong>
              <span>Je planifie les séances de mes athlètes</span>
            </label>
          </fieldset>
          <div className="form-ligne">
            <label>
              Prénom
              <input
                name="prenom"
                value={valeurs.prenom}
                onChange={changer}
                required
                maxLength={100}
              />
            </label>
            <label>
              Nom
              <input name="nom" value={valeurs.nom} onChange={changer} required maxLength={100} />
            </label>
          </div>
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
            Mot de passe (8 caractères minimum)
            <input
              type="password"
              name="motDePasse"
              value={valeurs.motDePasse}
              onChange={changer}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-large" disabled={envoi}>
            {envoi ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>
        <p className="auth-lien">
          Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
