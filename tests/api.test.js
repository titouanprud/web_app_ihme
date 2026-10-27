// Tests de l'API : authentification et droits d'accès.
// Ils utilisent la base locale (docker compose up -d) et suppriment les
// comptes fictifs qu'ils créent à la fin. Lancement : npm test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { loadJwtSecret } from '../server/jwt.js';

let server;
let baseUrl;
const emailsCrees = [];

// Petit client HTTP : renvoie { status, body }
async function api(chemin, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/api/${chemin}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texte = await res.text();
  return { status: res.status, body: texte ? JSON.parse(texte) : null };
}

// Crée un compte fictif avec un email unique et renvoie { token, user }
async function creerCompte(role) {
  const email = `test-${crypto.randomUUID()}@exemple.test`;
  emailsCrees.push(email);
  const res = await api('auth/register', {
    method: 'POST',
    body: { email, motDePasse: 'motdepasse-test', prenom: 'Test', nom: role, role },
  });
  assert.equal(res.status, 201);
  return res.body;
}

// Crée un coach et un athlète reliés par une invitation
async function creerCoachEtAthlete() {
  const coach = await creerCompte('coach');
  const athlete = await creerCompte('athlete');
  const invitation = await api('invitations', { method: 'POST', token: coach.token });
  const accept = await api('invitations/accept', {
    method: 'POST',
    token: athlete.token,
    body: { code: invitation.body.code },
  });
  assert.equal(accept.status, 201);
  return { coach, athlete };
}

const SEANCE = {
  date: '2026-10-28',
  titre: 'Footing',
  sport: 'Course à pied',
  type: 'endurance',
  dureePrevueMin: 45,
};

before(async () => {
  await migrate();
  await loadJwtSecret();
  server = createApp().listen(0);
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1)', [emailsCrees]);
  server.close();
  await pool.end();
});

describe('santé', () => {
  test('GET /api/health renvoie ok', async () => {
    const res = await api('health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});

describe('authentification', () => {
  test('inscription puis connexion', async () => {
    const { user } = await creerCompte('coach');
    assert.equal(user.role, 'coach');
    assert.equal(user.mot_de_passe_hash, undefined, 'le hash ne doit jamais être renvoyé');

    const login = await api('auth/login', {
      method: 'POST',
      body: { email: user.email, motDePasse: 'motdepasse-test' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const me = await api('me', { token: login.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, user.email);
  });

  test('mauvais mot de passe : 401', async () => {
    const { user } = await creerCompte('athlete');
    const res = await api('auth/login', {
      method: 'POST',
      body: { email: user.email, motDePasse: 'pas-le-bon' },
    });
    assert.equal(res.status, 401);
  });

  test('email déjà utilisé : 409', async () => {
    const { user } = await creerCompte('athlete');
    const res = await api('auth/register', {
      method: 'POST',
      body: {
        email: user.email,
        motDePasse: 'motdepasse-test',
        prenom: 'A',
        nom: 'B',
        role: 'coach',
      },
    });
    assert.equal(res.status, 409);
  });

  test('données invalides : 400', async () => {
    const res = await api('auth/register', {
      method: 'POST',
      body: { email: 'pas-un-email', motDePasse: 'court', prenom: '', nom: '', role: 'admin' },
    });
    assert.equal(res.status, 400);
  });

  test('sans jeton ou avec un jeton falsifié : 401', async () => {
    assert.equal((await api('me')).status, 401);
    assert.equal((await api('me', { token: 'faux.jeton.signe' })).status, 401);
  });
});

describe('droits d’accès', () => {
  test('un athlète ne peut pas créer de séance', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const res = await api('seances', {
      method: 'POST',
      token: athlete.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    assert.equal(res.status, 403);
  });

  test('un coach ne voit pas les séances d’un athlète qui n’est pas le sien', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const periode = 'from=2026-10-26&to=2026-11-01';

    const lecture = await api(`seances?athleteId=${athlete.user.id}&${periode}`, {
      token: autreCoach.token,
    });
    assert.equal(lecture.status, 403);

    const creation = await api('seances', {
      method: 'POST',
      token: autreCoach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    assert.equal(creation.status, 403);
  });

  test('un coach ne peut ni modifier ni supprimer la séance d’un autre coach', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const seance = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    assert.equal(seance.status, 201);

    const chemin = `seances/${seance.body.id}`;
    assert.equal(
      (await api(chemin, { method: 'PUT', token: autreCoach.token, body: SEANCE })).status,
      404,
    );
    assert.equal((await api(chemin, { method: 'DELETE', token: autreCoach.token })).status, 404);
  });

  test('un athlète ne voit et ne commente que ses propres séances', async () => {
    const a = await creerCoachEtAthlete();
    const b = await creerCoachEtAthlete();
    const seanceDeA = await api('seances', {
      method: 'POST',
      token: a.coach.token,
      body: { ...SEANCE, athleteId: a.athlete.user.id },
    });

    // B demande les séances de A via athleteId : il ne reçoit que les siennes (aucune)
    const lecture = await api(
      `seances?athleteId=${a.athlete.user.id}&from=2026-10-26&to=2026-11-01`,
      { token: b.athlete.token },
    );
    assert.equal(lecture.status, 200);
    assert.deepEqual(lecture.body, []);

    const retour = await api(`seances/${seanceDeA.body.id}/retour`, {
      method: 'POST',
      token: b.athlete.token,
      body: { statut: 'realisee', ressenti: 5 },
    });
    assert.equal(retour.status, 404);
  });

  test('parcours complet : séance, retour de l’athlète, lecture par le coach', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const seance = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });

    const retour = await api(`seances/${seance.body.id}/retour`, {
      method: 'POST',
      token: athlete.token,
      body: { statut: 'realisee', ressenti: 7, dureeReelleMin: 50, commentaire: 'Bonnes jambes' },
    });
    assert.equal(retour.status, 200);

    const lecture = await api(
      `seances?athleteId=${athlete.user.id}&from=2026-10-26&to=2026-11-01`,
      { token: coach.token },
    );
    assert.equal(lecture.body.length, 1);
    assert.equal(lecture.body[0].statut, 'realisee');
    assert.equal(lecture.body[0].retour.ressenti, 7);
    assert.equal(lecture.body[0].retour.commentaire, 'Bonnes jambes');
  });

  test('un athlète ne peut rejoindre qu’un seul coach', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const invitation = await api('invitations', { method: 'POST', token: autreCoach.token });
    const res = await api('invitations/accept', {
      method: 'POST',
      token: athlete.token,
      body: { code: invitation.body.code },
    });
    assert.equal(res.status, 409);
  });
});
