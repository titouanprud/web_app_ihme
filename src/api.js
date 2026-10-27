// Module unique pour parler à l'API. Toutes les pages passent par la fonction api().

const CLE_JETON = 'coachplan_jeton';

export function getToken() {
  return localStorage.getItem(CLE_JETON);
}

export function setToken(token) {
  if (token) localStorage.setItem(CLE_JETON, token);
  else localStorage.removeItem(CLE_JETON);
}

// api('seances?from=...', { method: 'POST', body: {...} })
// Renvoie les données JSON, ou lève une Error avec le message du serveur.
export async function api(chemin, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    // BASE_URL vaut "/" en local et "/web-app-ihme/" en production
    response = await fetch(`${import.meta.env.BASE_URL}api/${chemin}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez votre connexion.');
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Jeton expiré ou invalide : on déconnecte l'utilisateur
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('session-expiree'));
    }
    throw new Error(data?.error ?? `Erreur inattendue (${response.status}).`);
  }
  return data;
}
