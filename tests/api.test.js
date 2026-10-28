// Tests de l'API : authentification, droits d'accès, demandes et messagerie.
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

// L'athlète envoie une demande au coach
function demander(athlete, coach) {
  return api('demandes', {
    method: 'POST',
    token: athlete.token,
    body: { coachId: coach.user.id },
  });
}

// Le coach accepte (ou refuse) la demande de l'athlète
function repondre(coach, athlete, decision = 'accepter') {
  return api(`demandes/${athlete.user.id}/${decision}`, { method: 'POST', token: coach.token });
}

// Crée un coach et un athlète reliés (demande envoyée puis acceptée)
async function creerCoachEtAthlete() {
  const coach = await creerCompte('coach');
  const athlete = await creerCompte('athlete');
  assert.equal((await demander(athlete, coach)).status, 201);
  assert.equal((await repondre(coach, athlete)).status, 200);
  return { coach, athlete };
}

const SEANCE = {
  date: '2026-10-28',
  titre: 'Footing',
  sport: 'course',
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
      body: { statut: 'realisee', difficulte: 5, forme: 5 },
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
      body: { statut: 'realisee', difficulte: 7, forme: 8, commentaire: 'Bonnes jambes' },
    });
    assert.equal(retour.status, 200);

    const lecture = await api(
      `seances?athleteId=${athlete.user.id}&from=2026-10-26&to=2026-11-01`,
      { token: coach.token },
    );
    assert.equal(lecture.body.length, 1);
    assert.equal(lecture.body[0].statut, 'realisee');
    assert.equal(lecture.body[0].retour.difficulte, 7);
    assert.equal(lecture.body[0].retour.forme, 8);
    assert.equal(lecture.body[0].retour.commentaire, 'Bonnes jambes');
  });

  test('retour : difficulté et forme obligatoires si la séance est réalisée', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const seance = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    const chemin = `seances/${seance.body.id}/retour`;
    const envoyer = (body) => api(chemin, { method: 'POST', token: athlete.token, body });

    assert.equal((await envoyer({ statut: 'realisee', difficulte: 6 })).status, 400);
    assert.equal((await envoyer({ statut: 'realisee', difficulte: 11, forme: 5 })).status, 400);
    // Séance non réalisée : un simple commentaire suffit
    const nonFaite = await envoyer({ statut: 'non_realisee', commentaire: 'Malade' });
    assert.equal(nonFaite.status, 200);
    assert.equal(nonFaite.body.retour.difficulte, null);
  });
});

describe('blocs de séance', () => {
  // 15 min d'échauffement, 6 × (1000 m à 3:40-3:45 /km + 2 min de récup), 10 min au calme
  const BLOCS = [
    { type: 'echauffement', mesure: 'duree', valeur: 900, cible: { type: 'zone', min: 1 } },
    {
      type: 'repetition',
      repetitions: 6,
      blocs: [
        {
          type: 'intervalle',
          mesure: 'distance',
          valeur: 1000,
          cible: { type: 'allure', min: 220, max: 225 },
          note: 'sur piste',
        },
        { type: 'recuperation', mesure: 'duree', valeur: 120, cible: { type: 'aucune' } },
      ],
    },
    { type: 'retour_calme', mesure: 'duree', valeur: 600 },
  ];

  test('une séance structurée en blocs est enregistrée puis relue à l’identique', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const res = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id, blocs: BLOCS },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.blocs.length, 3);
    assert.equal(res.body.blocs[1].repetitions, 6);
    assert.deepEqual(res.body.blocs[1].blocs[0].cible, { type: 'allure', min: 220, max: 225 });
    // Les valeurs par défaut sont complétées par le serveur
    assert.deepEqual(res.body.blocs[2].cible, { type: 'aucune' });

    // Modification : on inverse les deux premiers blocs
    const inverses = [BLOCS[1], BLOCS[0], BLOCS[2]];
    const modif = await api(`seances/${res.body.id}`, {
      method: 'PUT',
      token: coach.token,
      body: { ...SEANCE, blocs: inverses },
    });
    assert.equal(modif.status, 200);
    assert.equal(modif.body.blocs[0].type, 'repetition');
  });

  test('blocs invalides refusés avec un message qui indique le bloc', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const essai = (blocs, sport = 'course') =>
      api('seances', {
        method: 'POST',
        token: coach.token,
        body: { ...SEANCE, sport, athleteId: athlete.user.id, blocs },
      });

    // Puissance impossible en course à pied
    const puissance = await essai([
      { type: 'intervalle', mesure: 'duree', valeur: 300, cible: { type: 'puissance', min: 250 } },
    ]);
    assert.equal(puissance.status, 400);
    assert.match(puissance.body.error, /^Bloc 1 :/);

    // Allure impossible à vélo
    const allureVelo = await essai(
      [{ type: 'intervalle', mesure: 'duree', valeur: 300, cible: { type: 'allure', min: 240 } }],
      'velo',
    );
    assert.equal(allureVelo.status, 400);

    // Zone hors de 1 à 5, dans un sous-bloc
    const zone = await essai([
      {
        type: 'repetition',
        repetitions: 3,
        blocs: [
          { type: 'intervalle', mesure: 'duree', valeur: 60, cible: { type: 'zone', min: 6 } },
        ],
      },
    ]);
    assert.equal(zone.status, 400);
    assert.match(zone.body.error, /^Bloc 1\.1 :/);

    // Pas de répétition dans une répétition
    const imbrique = await essai([
      {
        type: 'repetition',
        repetitions: 2,
        blocs: [{ type: 'repetition', repetitions: 2, blocs: [] }],
      },
    ]);
    assert.equal(imbrique.status, 400);
  });
});

describe('duplication et bibliothèque', () => {
  test('dupliquer une séance vers une autre date et un autre de ses athlètes', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const athlete2 = await creerCompte('athlete');
    await demander(athlete2, coach);
    await repondre(coach, athlete2);

    const seance = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    const copie = await api(`seances/${seance.body.id}/dupliquer`, {
      method: 'POST',
      token: coach.token,
      body: { date: '2026-11-04', athleteId: athlete2.user.id },
    });
    assert.equal(copie.status, 201);
    assert.notEqual(copie.body.id, seance.body.id);
    assert.equal(copie.body.date, '2026-11-04');
    assert.equal(copie.body.athleteId, athlete2.user.id);
    assert.equal(copie.body.titre, SEANCE.titre);
    assert.equal(copie.body.statut, 'prevue');
  });

  test('impossible de dupliquer la séance d’un autre coach ou vers un athlète qui n’est pas le sien', async () => {
    const a = await creerCoachEtAthlete();
    const b = await creerCoachEtAthlete();
    const seanceA = await api('seances', {
      method: 'POST',
      token: a.coach.token,
      body: { ...SEANCE, athleteId: a.athlete.user.id },
    });
    const parB = await api(`seances/${seanceA.body.id}/dupliquer`, {
      method: 'POST',
      token: b.coach.token,
      body: { date: '2026-11-04', athleteId: b.athlete.user.id },
    });
    assert.equal(parB.status, 404);
    const versAthleteDeB = await api(`seances/${seanceA.body.id}/dupliquer`, {
      method: 'POST',
      token: a.coach.token,
      body: { date: '2026-11-04', athleteId: b.athlete.user.id },
    });
    assert.equal(versAthleteDeB.status, 403);
  });

  test('bibliothèque : chaque coach gère uniquement ses propres modèles', async () => {
    const coach = await creerCompte('coach');
    const autreCoach = await creerCompte('coach');
    const { date: _date, ...modele } = SEANCE;

    const cree = await api('seances-types', { method: 'POST', token: coach.token, body: modele });
    assert.equal(cree.status, 201);
    assert.equal((await api('seances-types', { token: coach.token })).body.length, 1);
    assert.deepEqual((await api('seances-types', { token: autreCoach.token })).body, []);

    const chemin = `seances-types/${cree.body.id}`;
    const modifAutre = await api(chemin, {
      method: 'PUT',
      token: autreCoach.token,
      body: { ...modele, titre: 'Piraté' },
    });
    assert.equal(modifAutre.status, 404);
    assert.equal((await api(chemin, { method: 'DELETE', token: autreCoach.token })).status, 404);

    const modif = await api(chemin, {
      method: 'PUT',
      token: coach.token,
      body: { ...modele, titre: 'Footing long' },
    });
    assert.equal(modif.body.titre, 'Footing long');
    assert.equal((await api(chemin, { method: 'DELETE', token: coach.token })).status, 204);
  });

  test('un athlète n’a pas accès à la bibliothèque', async () => {
    const athlete = await creerCompte('athlete');
    assert.equal((await api('seances-types', { token: athlete.token })).status, 403);
  });
});

describe('profil sportif : records et seuils', () => {
  const RECORDS = [
    { distance: '5k', tempsSec: 20 * 60 + 30, date: '2026-05-10' },
    { distance: '10k', tempsSec: 42 * 60 + 15 },
    { distance: 'semi', tempsSec: 3600 + 35 * 60 },
    { distance: 'marathon', tempsSec: 3 * 3600 + 30 * 60 },
  ];

  test('l’athlète saisit ses records, son coach les voit', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const res = await api('profil/records', {
      method: 'PUT',
      token: athlete.token,
      body: { records: RECORDS },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.records.length, 4);

    const vuParCoach = await api(`profil?athleteId=${athlete.user.id}`, { token: coach.token });
    assert.equal(vuParCoach.status, 200);
    const dixKm = vuParCoach.body.records.find((r) => r.distance === '10k');
    assert.equal(dixKm.tempsSec, 42 * 60 + 15);

    // Une nouvelle liste remplace la précédente
    await api('profil/records', {
      method: 'PUT',
      token: athlete.token,
      body: { records: [RECORDS[0]] },
    });
    assert.equal((await api('profil', { token: athlete.token })).body.records.length, 1);
  });

  test('records invalides refusés et réservés à l’athlète', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const envoyer = (token, records) =>
      api('profil/records', { method: 'PUT', token, body: { records } });

    // 5 km en 2 minutes : faute de frappe probable
    assert.equal((await envoyer(athlete.token, [{ distance: '5k', tempsSec: 120 }])).status, 400);
    assert.equal((await envoyer(athlete.token, [{ distance: '15k', tempsSec: 3600 }])).status, 400);
    assert.equal((await envoyer(coach.token, RECORDS)).status, 403);
  });

  test('le coach estime SV1 / SV2, l’athlète les voit sans pouvoir les modifier', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const seuils = { sv1Allure: 5 * 60 + 10, sv1Fc: 150, sv2Allure: 4 * 60 + 20, sv2Fc: 172 };
    const res = await api(`profil/seuils/${athlete.user.id}`, {
      method: 'PUT',
      token: coach.token,
      body: seuils,
    });
    assert.equal(res.status, 200);

    const vuParAthlete = await api('profil', { token: athlete.token });
    assert.equal(vuParAthlete.body.seuils.sv1Allure, seuils.sv1Allure);
    assert.equal(vuParAthlete.body.seuils.sv2Fc, seuils.sv2Fc);

    const parAthlete = await api(`profil/seuils/${athlete.user.id}`, {
      method: 'PUT',
      token: athlete.token,
      body: seuils,
    });
    assert.equal(parAthlete.status, 403);
  });

  test('seuils incohérents refusés, et seulement pour ses propres athlètes', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const chemin = `profil/seuils/${athlete.user.id}`;

    // SV2 plus lente que SV1
    const incoherent = await api(chemin, {
      method: 'PUT',
      token: coach.token,
      body: { sv1Allure: 300, sv2Allure: 320 },
    });
    assert.equal(incoherent.status, 400);

    const parAutre = await api(chemin, {
      method: 'PUT',
      token: autreCoach.token,
      body: { sv1Allure: 300, sv2Allure: 260 },
    });
    assert.equal(parAutre.status, 403);
    const lectureAutre = await api(`profil?athleteId=${athlete.user.id}`, {
      token: autreCoach.token,
    });
    assert.equal(lectureAutre.status, 403);
  });
});

describe('demandes coach / athlète', () => {
  test('une demande en attente ne donne encore aucun droit', async () => {
    const coach = await creerCompte('coach');
    const athlete = await creerCompte('athlete');
    await demander(athlete, coach);

    const me = await api('me', { token: athlete.token });
    assert.equal(me.body.coach, null);
    assert.equal(me.body.demande.statut, 'en_attente');

    const seances = await api(
      `seances?athleteId=${athlete.user.id}&from=2026-10-26&to=2026-11-01`,
      {
        token: coach.token,
      },
    );
    assert.equal(seances.status, 403);
    assert.equal((await api('messages', { token: athlete.token })).status, 403);
  });

  test('seul le coach destinataire peut accepter la demande', async () => {
    const coach = await creerCompte('coach');
    const autreCoach = await creerCompte('coach');
    const athlete = await creerCompte('athlete');
    await demander(athlete, coach);

    assert.equal((await repondre(autreCoach, athlete)).status, 404);
    // Un athlète ne peut pas accepter une demande (route réservée aux coachs)
    const parAthlete = await api(`demandes/${athlete.user.id}/accepter`, {
      method: 'POST',
      token: athlete.token,
    });
    assert.equal(parAthlete.status, 403);

    const demandes = await api('demandes', { token: coach.token });
    assert.deepEqual(
      demandes.body.map((d) => d.athleteId),
      [athlete.user.id],
    );
    assert.equal((await repondre(coach, athlete)).status, 200);
    const me = await api('me', { token: athlete.token });
    assert.equal(me.body.coach.id, coach.user.id);
  });

  test('une seule demande à la fois, nouvelle demande possible après un refus', async () => {
    const coachA = await creerCompte('coach');
    const coachB = await creerCompte('coach');
    const athlete = await creerCompte('athlete');

    await demander(athlete, coachA);
    assert.equal((await demander(athlete, coachB)).status, 409);

    assert.equal((await repondre(coachA, athlete, 'refuser')).status, 200);
    const me = await api('me', { token: athlete.token });
    assert.equal(me.body.demande.statut, 'refusee');

    assert.equal((await demander(athlete, coachB)).status, 201);
  });

  test('un athlète déjà relié ne peut pas demander un autre coach', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    assert.equal((await demander(athlete, autreCoach)).status, 409);
  });

  test('l’athlète peut annuler sa demande en attente', async () => {
    const coach = await creerCompte('coach');
    const athlete = await creerCompte('athlete');
    await demander(athlete, coach);
    assert.equal((await api('demandes', { method: 'DELETE', token: athlete.token })).status, 204);
    const me = await api('me', { token: athlete.token });
    assert.equal(me.body.demande, null);
  });
});

describe('messagerie', () => {
  test('coach et athlète échangent des messages, avec compteur de non lus', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();

    const envoi = await api('messages', {
      method: 'POST',
      token: coach.token,
      body: { athleteId: athlete.user.id, contenu: 'Bonjour, prêt pour la semaine ?' },
    });
    assert.equal(envoi.status, 201);

    const notifs = await api('notifications', { token: athlete.token });
    assert.equal(notifs.body.messagesNonLus, 1);

    // Lire la conversation marque le message comme lu
    const lecture = await api('messages', { token: athlete.token });
    assert.equal(lecture.body.length, 1);
    assert.equal(lecture.body[0].contenu, 'Bonjour, prêt pour la semaine ?');
    assert.equal((await api('notifications', { token: athlete.token })).body.messagesNonLus, 0);

    await api('messages', { method: 'POST', token: athlete.token, body: { contenu: 'Oui !' } });
    const notifsCoach = await api('notifications', { token: coach.token });
    assert.equal(notifsCoach.body.parAthlete[athlete.user.id], 1);
  });

  test('un coach ne peut pas lire ni écrire dans la conversation d’un autre binôme', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const lecture = await api(`messages?athleteId=${athlete.user.id}`, { token: autreCoach.token });
    assert.equal(lecture.status, 403);
    const envoi = await api('messages', {
      method: 'POST',
      token: autreCoach.token,
      body: { athleteId: athlete.user.id, contenu: 'Coucou' },
    });
    assert.equal(envoi.status, 403);
  });

  test('message vide refusé', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const res = await api('messages', {
      method: 'POST',
      token: athlete.token,
      body: { contenu: '   ' },
    });
    assert.equal(res.status, 400);
  });
});
