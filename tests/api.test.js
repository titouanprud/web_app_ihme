// Tests de l'API : authentification, droits d'accès, demandes et messagerie.
// Ils utilisent la base locale (docker compose up -d) et suppriment les
// comptes fictifs qu'ils créent à la fin. Lancement : npm test
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { MODELES_DE_DEPART } from '../server/catalogueDepart.js';
import { loadJwtSecret } from '../server/jwt.js';
import {
  allureDeReference,
  estimerBloc,
  estimerBlocs,
  resoudreReferences,
} from '../server/partage/estimation.js';
import { moisDeLaSemaine, periodeAffichee } from '../src/calendrier.js';

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

describe('ski-alpinisme et D+', () => {
  // 20 min d'échauffement (D+ 100 m), 3 × (10 min Z3, D+ 150 m + 5 min de descente)
  const BLOCS_SKI = [
    {
      type: 'echauffement',
      mesure: 'duree',
      valeur: 1200,
      cible: { type: 'zone', min: 1 },
      dplus: 100,
    },
    {
      type: 'repetition',
      repetitions: 3,
      blocs: [
        {
          type: 'intervalle',
          mesure: 'duree',
          valeur: 600,
          cible: { type: 'zone', min: 3 },
          dplus: 150,
        },
        { type: 'recuperation', mesure: 'duree', valeur: 300 },
      ],
    },
  ];

  test('calcul partagé : le D+ total compte les répétitions', () => {
    const t = estimerBlocs(BLOCS_SKI);
    assert.equal(t.dplus, 100 + 3 * 150);
    assert.equal(t.duree, 1200 + 3 * (600 + 300));
  });

  test('le D+ de la séance est la somme des blocs, sinon la valeur saisie', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const ski = { ...SEANCE, sport: 'ski_alpi', athleteId: athlete.user.id };

    const avecBlocs = await api('seances', {
      method: 'POST',
      token: coach.token,
      // La valeur saisie est ignorée quand les blocs ont un D+
      body: { ...ski, blocs: BLOCS_SKI, dplusPrevuM: 9999 },
    });
    assert.equal(avecBlocs.status, 201);
    assert.equal(avecBlocs.body.dplusPrevuM, 550);
    assert.equal(avecBlocs.body.blocs[1].blocs[0].dplus, 150);

    const sansBlocs = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...ski, dplusPrevuM: 1200 },
    });
    assert.equal(sansBlocs.body.dplusPrevuM, 1200);
  });

  test('D+ refusé hors course / vélo / ski, ou hors de 0 à 10 000 m', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const essai = (sport, blocs) =>
      api('seances', {
        method: 'POST',
        token: coach.token,
        body: { ...SEANCE, sport, athleteId: athlete.user.id, blocs },
      });
    const bloc = (dplus) => [{ type: 'intervalle', mesure: 'duree', valeur: 600, dplus }];

    assert.equal((await essai('renfo', bloc(100))).status, 400);
    assert.equal((await essai('velo', bloc(10001))).status, 400);
    assert.equal((await essai('ski_alpi', bloc(-5))).status, 400);
    // Pas d'allure en ski-alpinisme : seulement zone ou aucune cible
    const allure = await essai('ski_alpi', [
      { type: 'intervalle', mesure: 'duree', valeur: 600, cible: { type: 'allure', min: 300 } },
    ]);
    assert.equal(allure.status, 400);
    assert.equal((await essai('ski_alpi', bloc(800))).status, 201);
  });
});

describe('allures de référence et estimation', () => {
  const PROFIL = {
    records: [
      { distance: '10k', tempsSec: 42 * 60 }, // 4:12 /km
      { distance: 'semi', tempsSec: 3600 + 30 * 60 }, // 5400 s ÷ 21,0975 km
    ],
    seuils: { sv1Allure: 300, sv2Allure: 250 },
  };
  const ref = (r, allure = null) => ({ type: 'reference', ref: r, allure_sec: allure });

  test('allure calculée depuis les records et les seuils', () => {
    assert.equal(allureDeReference('10k', PROFIL), 252);
    assert.equal(allureDeReference('21k', PROFIL), 256); // 255,95 arrondi
    assert.equal(allureDeReference('sv2', PROFIL), 250);
    assert.equal(allureDeReference('5k', PROFIL), null); // pas de record sur 5 km
    assert.equal(allureDeReference('sv1', { records: [], seuils: null }), null);
  });

  test('estimation : distance d’un bloc en durée, durée d’un bloc en distance', () => {
    // 10 min à 5:00 /km → 2 km ; 3 km à @10k (4:12) → 756 s
    assert.equal(
      estimerBloc({ mesure: 'duree', valeur: 600, cible: ref('sv1', 300) }).distance,
      2000,
    );
    assert.equal(
      estimerBloc({ mesure: 'distance', valeur: 3000, cible: ref('10k', 252) }).duree,
      756,
    );
    // Fourchette d'allure : on prend le milieu (4:50 – 5:10 → 5:00)
    const fourchette = { type: 'allure', min: 290, max: 310 };
    assert.equal(estimerBloc({ mesure: 'duree', valeur: 600, cible: fourchette }).distance, 2000);
    // Sans allure : la valeur manquante est inconnue
    assert.equal(
      estimerBloc({ mesure: 'distance', valeur: 1000, cible: { type: 'zone' } }).duree,
      null,
    );

    // Séance : 10 min d'échauffement à 5:00 + 3 × (1 km @10k + 2 min sans cible)
    const blocs = [
      { type: 'echauffement', mesure: 'duree', valeur: 600, cible: ref('sv1', 300) },
      {
        type: 'repetition',
        repetitions: 3,
        blocs: [
          { type: 'intervalle', mesure: 'distance', valeur: 1000, cible: ref('10k', 252) },
          { type: 'recuperation', mesure: 'duree', valeur: 120, cible: { type: 'aucune' } },
        ],
      },
    ];
    const t = estimerBlocs(blocs);
    assert.equal(t.duree, 600 + 3 * (252 + 120));
    assert.equal(t.distance, 2000 + 3 * 1000);
    assert.equal(t.dureeComplete, true);
    assert.equal(t.distanceComplete, false); // la récupération sans allure
  });

  test('résolution d’un modèle : seules les références vides prennent l’allure du profil', () => {
    const blocs = [
      { type: 'intervalle', mesure: 'duree', valeur: 600, cible: ref('10k') },
      {
        type: 'intervalle',
        mesure: 'duree',
        valeur: 600,
        cible: { ...ref('sv1', 280), modifiee: true },
      },
    ];
    const resolus = resoudreReferences(blocs, PROFIL);
    assert.equal(resolus[0].cible.allure_sec, 252);
    assert.equal(resolus[1].cible.allure_sec, 280);
    assert.equal(resolus[1].cible.modifiee, true);
  });

  test('séance : l’allure manquante est prise dans le profil, sinon le coach doit la saisir', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    await api('profil/records', {
      method: 'PUT',
      token: athlete.token,
      body: { records: [{ distance: '10k', tempsSec: 42 * 60 }] },
    });
    const creer = (blocs) =>
      api('seances', {
        method: 'POST',
        token: coach.token,
        body: { ...SEANCE, athleteId: athlete.user.id, blocs },
      });
    const bloc = (cible) => [{ type: 'intervalle', mesure: 'distance', valeur: 2000, cible }];

    const depuisProfil = await creer(bloc(ref('10k')));
    assert.equal(depuisProfil.status, 201);
    assert.deepEqual(depuisProfil.body.blocs[0].cible, { ...ref('10k', 252), modifiee: false });

    // Allure modifiée par le coach : conservée telle quelle
    const modifiee = await creer(bloc({ ...ref('10k', 245), modifiee: true }));
    assert.equal(modifiee.body.blocs[0].cible.allure_sec, 245);
    assert.equal(modifiee.body.blocs[0].cible.modifiee, true);

    // Pas de seuil SV2 dans le profil : 400 avec un message clair
    const absente = await creer(bloc(ref('sv2')));
    assert.equal(absente.status, 400);
    assert.match(absente.body.error, /@SV2/);

    // Référence inconnue, ou allure de référence à vélo : refusées
    assert.equal((await creer(bloc(ref('15k', 250)))).status, 400);
    const velo = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, sport: 'velo', athleteId: athlete.user.id, blocs: bloc(ref('10k', 250)) },
    });
    assert.equal(velo.status, 400);
  });

  test('un modèle garde la référence sans allure fixe', async () => {
    const coach = await creerCompte('coach');
    const { date: _date, ...modele } = SEANCE;
    const res = await api('seances-types', {
      method: 'POST',
      token: coach.token,
      body: {
        ...modele,
        blocs: [{ type: 'intervalle', mesure: 'distance', valeur: 400, cible: ref('5k', 230) }],
      },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.blocs[0].cible, { ...ref('5k'), modifiee: false });
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
    // Le catalogue contient les modèles de départ + le nouveau ; l'autre coach ne le voit pas
    const nombreDepart = MODELES_DE_DEPART.length;
    assert.equal(
      (await api('seances-types', { token: coach.token })).body.length,
      nombreDepart + 1,
    );
    const chezAutre = (await api('seances-types', { token: autreCoach.token })).body;
    assert.equal(chezAutre.length, nombreDepart);
    assert.ok(!chezAutre.some((m) => m.id === cree.body.id));

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

describe('catalogue de départ et glisser-déposer', () => {
  test('un nouveau coach reçoit le catalogue de départ une seule fois', async () => {
    const coach = await creerCompte('coach');
    const catalogue = (await api('seances-types', { token: coach.token })).body;
    assert.equal(catalogue.length, MODELES_DE_DEPART.length);
    for (const sport of ['course', 'velo', 'ski_alpi', 'renfo']) {
      assert.ok(
        catalogue.some((m) => m.sport === sport),
        `aucun modèle de ${sport}`,
      );
    }
    // Il supprime tout : les modèles ne reviennent pas au prochain affichage
    for (const m of catalogue) {
      await api(`seances-types/${m.id}`, { method: 'DELETE', token: coach.token });
    }
    assert.deepEqual((await api('seances-types', { token: coach.token })).body, []);
  });

  test('un coach créé avant le catalogue le reçoit au premier affichage', async () => {
    const coach = await creerCompte('coach');
    // On simule un compte ancien : pas de modèle, drapeau à false
    await pool.query('DELETE FROM seances_types WHERE coach_id = $1', [coach.user.id]);
    await pool.query('UPDATE users SET catalogue_initialise = false WHERE id = $1', [
      coach.user.id,
    ]);
    const catalogue = await api('seances-types', { token: coach.token });
    assert.equal(catalogue.body.length, MODELES_DE_DEPART.length);
    // Deux affichages de suite ne le dupliquent pas
    assert.equal(
      (await api('seances-types', { token: coach.token })).body.length,
      MODELES_DE_DEPART.length,
    );
  });

  test('glisser un modèle crée une copie avec les allures du profil de l’athlète', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const modele = (await api('seances-types', { token: coach.token })).body.find(
      (m) => m.titre === '10 × 400 m @5k',
    );
    const deposer = (body, token = coach.token) =>
      api('seances/depuis-modele', { method: 'POST', token, body });
    const corps = { modeleId: modele.id, athleteId: athlete.user.id, date: '2026-11-12' };

    // Pas de record sur 5 km : le coach doit d'abord le connaître
    const sansRecord = await deposer(corps);
    assert.equal(sansRecord.status, 400);
    assert.match(sansRecord.body.error, /@5k/);

    await api('profil/records', {
      method: 'PUT',
      token: athlete.token,
      body: { records: [{ distance: '5k', tempsSec: 20 * 60 }] }, // 4:00 /km
    });
    const copie = await deposer(corps);
    assert.equal(copie.status, 201);
    assert.equal(copie.body.date, '2026-11-12');
    assert.equal(copie.body.athleteId, athlete.user.id);
    assert.equal(copie.body.blocs[1].blocs[0].cible.allure_sec, 240);
    assert.ok(copie.body.distanceEstimeeM > 0);

    // Le modèle n'a pas changé : toujours sans allure
    const apres = (await api('seances-types', { token: coach.token })).body.find(
      (m) => m.id === modele.id,
    );
    assert.equal(apres.blocs[1].blocs[0].cible.allure_sec, null);
  });

  test('modèle d’un autre coach, athlète d’un autre coach ou athlète connecté : refusé', async () => {
    const a = await creerCoachEtAthlete();
    const b = await creerCoachEtAthlete();
    const modeleDeA = (await api('seances-types', { token: a.coach.token })).body[0];
    const deposer = (token, modeleId, athleteId) =>
      api('seances/depuis-modele', {
        method: 'POST',
        token,
        body: { modeleId, athleteId, date: '2026-11-12' },
      });
    assert.equal((await deposer(b.coach.token, modeleDeA.id, b.athlete.user.id)).status, 404);
    assert.equal((await deposer(a.coach.token, modeleDeA.id, b.athlete.user.id)).status, 403);
    assert.equal((await deposer(a.athlete.token, modeleDeA.id, a.athlete.user.id)).status, 403);
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

  test('records invalides refusés ; chacun n’enregistre que ses propres records', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const envoyer = (token, records) =>
      api('profil/records', { method: 'PUT', token, body: { records } });

    // 5 km en 2 minutes : faute de frappe probable
    assert.equal((await envoyer(athlete.token, [{ distance: '5k', tempsSec: 120 }])).status, 400);
    assert.equal((await envoyer(athlete.token, [{ distance: '15k', tempsSec: 3600 }])).status, 400);
    // Le coach enregistre ses records à lui (son entraînement), pas ceux de son athlète
    assert.equal((await envoyer(coach.token, RECORDS)).status, 200);
    assert.equal((await api('profil', { token: athlete.token })).body.records.length, 0);
    assert.equal(
      (await api(`profil?athleteId=${coach.user.id}`, { token: coach.token })).body.records.length,
      4,
    );
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

describe('calendrier et totaux', () => {
  test('périodes affichées par chaque vue', () => {
    assert.deepEqual(periodeAffichee('semaine', '2026-11-12'), {
      debut: '2026-11-09',
      fin: '2026-11-15',
      grilleDebut: '2026-11-09',
      grilleFin: '2026-11-15',
    });
    // Trimestre 4 : octobre → décembre, élargi à des semaines complètes (lundi → dimanche)
    assert.deepEqual(periodeAffichee('trimestre', '2026-11-12'), {
      debut: '2026-10-01',
      fin: '2026-12-31',
      grilleDebut: '2026-09-28',
      grilleFin: '2027-01-03',
    });
    assert.equal(periodeAffichee('annee', '2026-11-12').debut, '2026-01-01');
    assert.equal(periodeAffichee('mois', '2026-02-10').fin, '2026-02-28');
    // La semaine du lundi 28 septembre a son jeudi le 1er octobre : elle compte pour octobre
    assert.equal(moisDeLaSemaine('2026-09-28'), '2026-10-01');
  });

  test('durée et distance estimées enregistrées avec la séance', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const res = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: {
        ...SEANCE,
        athleteId: athlete.user.id,
        dureePrevueMin: null,
        // 20 min à 5:00 /km (4 km) + 2 km à 4:00 /km (8 min)
        blocs: [
          {
            type: 'echauffement',
            mesure: 'duree',
            valeur: 1200,
            cible: { type: 'allure', min: 300 },
          },
          {
            type: 'intervalle',
            mesure: 'distance',
            valeur: 2000,
            cible: { type: 'allure', min: 240 },
          },
        ],
      },
    });
    assert.equal(res.body.dureeEstimeeSec, 1200 + 480);
    assert.equal(res.body.distanceEstimeeM, 6000);

    // Sans blocs : la durée prévue saisie, pas de distance
    const simple = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    assert.equal(simple.body.dureeEstimeeSec, 45 * 60);
    assert.equal(simple.body.distanceEstimeeM, 0);
  });

  test('totaux par semaine et par mois, sur le prévu', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const creer = (seance) =>
      api('seances', {
        method: 'POST',
        token: coach.token,
        body: { ...SEANCE, athleteId: athlete.user.id, ...seance },
      });
    const kmEnDuree = (metres, allure) => [
      {
        type: 'intervalle',
        mesure: 'distance',
        valeur: metres,
        cible: { type: 'allure', min: allure },
      },
    ];
    // Semaine du 26 oct. : 10 km de course (50 min) + 1 h de vélo ; semaine du 2 nov. : ski + renfo
    await creer({ date: '2026-10-27', blocs: kmEnDuree(10000, 300), dureePrevueMin: null });
    await creer({ date: '2026-10-29', sport: 'velo', dureePrevueMin: 60, dplusPrevuM: 400 });
    await creer({ date: '2026-11-02', sport: 'ski_alpi', dureePrevueMin: 120, dplusPrevuM: 1100 });
    await creer({ date: '2026-11-04', sport: 'renfo', type: 'renfo', dureePrevueMin: 30 });

    const chemin = (groupe) =>
      `seances/totaux?athleteId=${athlete.user.id}&from=2026-10-26&to=2026-11-08&groupe=${groupe}`;
    const semaines = await api(chemin('semaine'), { token: coach.token });
    assert.equal(semaines.status, 200);
    assert.deepEqual(
      semaines.body.map((t) => t.periode),
      ['2026-10-26', '2026-11-02'],
    );
    const [s1, s2] = semaines.body;
    assert.equal(s1.courseDistanceM, 10000);
    assert.equal(s1.courseDureeSec, 3000);
    assert.equal(s1.veloDureeSec, 3600);
    assert.equal(s1.dplusM, 400);
    assert.equal(s1.dureeSec, 6600);
    assert.equal(s2.skiDureeSec, 7200);
    assert.equal(s2.skiDplusM, 1100);
    assert.equal(s2.renfoDureeSec, 1800);
    assert.equal(s2.nombre, 2);

    const mois = await api(chemin('mois'), { token: coach.token });
    assert.deepEqual(
      mois.body.map((t) => [t.periode, t.nombre]),
      [
        ['2026-10-01', 2],
        ['2026-11-01', 2],
      ],
    );

    // L'athlète lit ses propres totaux ; un autre coach n'y a pas accès
    const parAthlete = await api(chemin('semaine'), { token: athlete.token });
    assert.equal(parAthlete.body.length, 2);
    const autreCoach = await creerCompte('coach');
    assert.equal((await api(chemin('semaine'), { token: autreCoach.token })).status, 403);
  });

  test('totaux : regroupement et période vérifiés', async () => {
    const { athlete } = await creerCoachEtAthlete();
    const totaux = (requete) => api(`seances/totaux?${requete}`, { token: athlete.token });
    assert.equal((await totaux('from=2026-01-01&to=2026-01-31&groupe=jour')).status, 400);
    assert.equal((await totaux('from=2026-01-01&to=2027-06-30')).status, 400); // > 400 jours
    assert.equal((await totaux('from=2026-02-01&to=2026-01-01')).status, 400);
  });
});

describe('cycles', () => {
  // Du lundi 5 octobre au dimanche 1er novembre 2026 (4 semaines)
  const CYCLE = {
    nom: 'Prépa générale',
    type: 'preparation_generale',
    dateDebut: '2026-10-05',
    dateFin: '2026-11-01',
    objectif: 'Construire le volume',
    couleur: '#16a34a',
  };

  test('le coach crée un cycle, l’athlète le voit sans pouvoir le modifier', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const cree = await api('cycles', {
      method: 'POST',
      token: coach.token,
      body: { ...CYCLE, athleteId: athlete.user.id },
    });
    assert.equal(cree.status, 201);
    assert.equal(cree.body.dateDebut, '2026-10-05');

    const vu = await api('cycles?from=2026-10-26&to=2026-11-01', { token: athlete.token });
    assert.equal(vu.body.length, 1);
    assert.equal(vu.body[0].objectif, 'Construire le volume');
    // Période sans cycle
    const avant = await api('cycles?from=2026-09-01&to=2026-09-30', { token: athlete.token });
    assert.deepEqual(avant.body, []);

    const chemin = `cycles/${cree.body.id}`;
    const parAthlete = await api('cycles', {
      method: 'POST',
      token: athlete.token,
      body: { ...CYCLE, athleteId: athlete.user.id },
    });
    assert.equal(parAthlete.status, 403);
    assert.equal(
      (await api(chemin, { method: 'PUT', token: athlete.token, body: CYCLE })).status,
      403,
    );
    assert.equal((await api(chemin, { method: 'DELETE', token: athlete.token })).status, 403);
  });

  test('dates : un lundi et un dimanche, sans chevauchement', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const creer = (cycle) =>
      api('cycles', {
        method: 'POST',
        token: coach.token,
        body: { ...CYCLE, athleteId: athlete.user.id, ...cycle },
      });
    assert.equal((await creer({ dateDebut: '2026-10-06' })).status, 400); // un mardi
    assert.equal((await creer({ dateFin: '2026-10-31' })).status, 400); // un samedi
    assert.equal((await creer({ couleur: 'vert' })).status, 400);
    assert.equal((await creer({ type: 'sieste' })).status, 400);

    const premier = await creer({});
    assert.equal(premier.status, 201);
    // Chevauche la dernière semaine du premier cycle
    const chevauche = await creer({ dateDebut: '2026-10-26', dateFin: '2026-11-08' });
    assert.equal(chevauche.status, 409);
    // Commence le lundi qui suit : accepté
    const suivant = await creer({
      nom: 'Affûtage',
      dateDebut: '2026-11-02',
      dateFin: '2026-11-15',
    });
    assert.equal(suivant.status, 201);

    // Modifier le second pour empiéter sur le premier : refusé ; le modifier sans conflit : accepté
    const chemin = `cycles/${suivant.body.id}`;
    const empiete = await api(chemin, {
      method: 'PUT',
      token: coach.token,
      body: { ...CYCLE, dateDebut: '2026-10-19', dateFin: '2026-11-15' },
    });
    assert.equal(empiete.status, 409);
    const ok = await api(chemin, {
      method: 'PUT',
      token: coach.token,
      body: { ...CYCLE, nom: 'Affûtage court', dateDebut: '2026-11-02', dateFin: '2026-11-08' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.nom, 'Affûtage court');
  });

  test('un autre coach n’accède pas aux cycles ; le coach a les siens', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const autreCoach = await creerCompte('coach');
    const cree = await api('cycles', {
      method: 'POST',
      token: coach.token,
      body: { ...CYCLE, athleteId: athlete.user.id },
    });
    const chemin = `cycles/${cree.body.id}`;
    const pour = `athleteId=${athlete.user.id}&from=2026-10-01&to=2026-10-31`;
    assert.equal((await api(`cycles?${pour}`, { token: autreCoach.token })).status, 403);
    assert.equal(
      (await api(chemin, { method: 'PUT', token: autreCoach.token, body: CYCLE })).status,
      404,
    );
    assert.equal((await api(chemin, { method: 'DELETE', token: autreCoach.token })).status, 404);
    const pourAthleteDuCoach = await api('cycles', {
      method: 'POST',
      token: autreCoach.token,
      body: { ...CYCLE, athleteId: athlete.user.id },
    });
    assert.equal(pourAthleteDuCoach.status, 403);

    // Le coach se crée un cycle à lui (même période que celui de son athlète : pas de conflit)
    const moi = await api('cycles', {
      method: 'POST',
      token: coach.token,
      body: { ...CYCLE, athleteId: coach.user.id },
    });
    assert.equal(moi.status, 201);
    assert.equal((await api(chemin, { method: 'DELETE', token: coach.token })).status, 204);
  });
});

describe('entraînement du coach', () => {
  const periode = 'from=2026-10-26&to=2026-11-01';

  test('le coach planifie ses propres séances et en fait le retour', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const moi = coach.user.id;
    const creation = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: moi },
    });
    assert.equal(creation.status, 201);
    assert.equal(creation.body.athleteId, moi);

    const lecture = await api(`seances?athleteId=${moi}&${periode}`, { token: coach.token });
    assert.equal(lecture.status, 200);
    assert.equal(lecture.body.length, 1);

    const retour = await api(`seances/${creation.body.id}/retour`, {
      method: 'POST',
      token: coach.token,
      body: { statut: 'realisee', difficulte: 6, forme: 7 },
    });
    assert.equal(retour.status, 200);
    assert.equal(retour.body.statut, 'realisee');

    // L'athlète du coach ne voit pas les séances de son coach
    const vuParAthlete = await api(`seances?athleteId=${moi}&${periode}`, { token: athlete.token });
    assert.deepEqual(vuParAthlete.body, []);
  });

  test('le coach a son profil (records, seuils), invisible pour un autre coach', async () => {
    const coach = await creerCompte('coach');
    const autreCoach = await creerCompte('coach');
    const moi = coach.user.id;
    const seuils = await api(`profil/seuils/${moi}`, {
      method: 'PUT',
      token: coach.token,
      body: { sv1Allure: 290, sv2Allure: 250 },
    });
    assert.equal(seuils.status, 200);
    assert.equal(
      (await api(`profil?athleteId=${moi}`, { token: coach.token })).body.seuils.sv2Allure,
      250,
    );
    assert.equal((await api(`profil?athleteId=${moi}`, { token: autreCoach.token })).status, 403);
    assert.equal(
      (await api(`seances?athleteId=${moi}&${periode}`, { token: autreCoach.token })).status,
      403,
    );
    const pourAutre = await api('seances', {
      method: 'POST',
      token: autreCoach.token,
      body: { ...SEANCE, athleteId: moi },
    });
    assert.equal(pourAutre.status, 403);
  });

  test('le coach ne fait pas le retour des séances de ses athlètes, ni ne s’écrit', async () => {
    const { coach, athlete } = await creerCoachEtAthlete();
    const seance = await api('seances', {
      method: 'POST',
      token: coach.token,
      body: { ...SEANCE, athleteId: athlete.user.id },
    });
    const retour = await api(`seances/${seance.body.id}/retour`, {
      method: 'POST',
      token: coach.token,
      body: { statut: 'realisee', difficulte: 6, forme: 7 },
    });
    assert.equal(retour.status, 404);
    const message = await api('messages', {
      method: 'POST',
      token: coach.token,
      body: { athleteId: coach.user.id, contenu: 'Note pour moi' },
    });
    assert.equal(message.status, 403);
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
