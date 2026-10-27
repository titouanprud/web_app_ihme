import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

// Le "contexte" rend l'utilisateur connecté accessible à tous les composants.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // S'il y a un jeton enregistré, on charge l'utilisateur avant d'afficher les pages.
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  const refreshUser = useCallback(async () => {
    const me = await api('me');
    setUser(me);
    return me;
  }, []);

  // Au chargement de la page : jeton enregistré → on récupère l'utilisateur
  useEffect(() => {
    if (!getToken()) return;
    api('me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  // Déclenché par api.js quand le serveur répond 401
  useEffect(() => {
    const surExpiration = () => setUser(null);
    window.addEventListener('session-expiree', surExpiration);
    return () => window.removeEventListener('session-expiree', surExpiration);
  }, []);

  // Enregistre le jeton puis charge le profil complet (avec le coach éventuel)
  const login = useCallback(
    async (token) => {
      setToken(token);
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
