import { Router } from 'express';
import { pool } from '../db.js';
import { HttpError } from '../errors.js';
import { verifierAthleteDuCoach } from '../liens.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import * as valider from '../validation.js';

// Profil sportif d'un athlète :
// - records sur 5 km, 10 km, semi et marathon : saisis par l'athlète, visibles par son coach ;
// - seuils SV1 / SV2 : estimés par le coach, visibles (sans modification) par l'athlète.
const router = Router();

// Temps acceptés pour chaque distance, en secondes (bornes larges pour éviter les fautes de frappe)
const DISTANCES = {
  '5k': { min: 600, max: 3 * 3600, libelle: 'Le temps sur 5 km' },
  '10k': { min: 1200, max: 5 * 3600, libelle: 'Le temps sur 10 km' },
  semi: { min: 2700, max: 8 * 3600, libelle: 'Le temps sur semi-marathon' },
  marathon: { min: 5400, max: 12 * 3600, libelle: 'Le temps sur marathon' },
};

async function lireProfil(athleteId) {
  const records = await pool.query(
    `SELECT distance, temps_sec AS "tempsSec", date_record AS "date"
     FROM records WHERE athlete_id = $1`,
    [athleteId],
  );
  const seuils = await pool.query(
    `SELECT sv1_allure_sec AS "sv1Allure", sv1_fc AS "sv1Fc",
            sv2_allure_sec AS "sv2Allure", sv2_fc AS "sv2Fc", date_maj AS "dateMaj"
     FROM seuils WHERE athlete_id = $1`,
    [athleteId],
  );
  return { records: records.rows, seuils: seuils.rows[0] ?? null };
}

// GET /api/profil?athleteId= : l'athlète lit son profil, le coach celui d'un de ses athlètes
router.get('/', requireAuth, async (req, res) => {
  let athleteId = req.user.id;
  if (req.user.role === 'coach') {
    athleteId = valider.identifiant(req.query.athleteId, "L'athlète (athleteId)");
    await verifierAthleteDuCoach(req.user.id, athleteId);
  }
  res.json(await lireProfil(athleteId));
});

// PUT /api/profil/records : l'athlète enregistre ses records.
// Corps : { records: [{ distance: '10k', tempsSec: 2700, date: '2026-04-12' | null }, …] }
// La liste remplace les records précédents (une distance absente est effacée).
router.put('/records', requireAuth, requireRole('athlete'), async (req, res) => {
  const liste = req.body?.records;
  if (!Array.isArray(liste)) throw new HttpError(400, 'Les records doivent être une liste.');

  const vus = new Set();
  const records = liste.map((r) => {
    const distance = valider.choix(r?.distance, 'La distance', Object.keys(DISTANCES));
    if (vus.has(distance)) throw new HttpError(400, 'Une distance est présente deux fois.');
    vus.add(distance);
    const bornes = DISTANCES[distance];
    return {
      distance,
      tempsSec: valider.entier(r.tempsSec, bornes.libelle, bornes),
      date: r.date ? valider.dateISO(r.date, 'La date du record') : null,
    };
  });

  // Transaction : on remplace tout ou rien
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM records WHERE athlete_id = $1', [req.user.id]);
    for (const r of records) {
      await client.query(
        `INSERT INTO records (athlete_id, distance, temps_sec, date_record) VALUES ($1, $2, $3, $4)`,
        [req.user.id, r.distance, r.tempsSec, r.date],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json(await lireProfil(req.user.id));
});

// PUT /api/profil/seuils/:athleteId : le coach enregistre son estimation de SV1 et SV2.
// Allures en secondes par km, FC en battements par minute ; chaque valeur est facultative.
router.put('/seuils/:athleteId', requireAuth, requireRole('coach'), async (req, res) => {
  const athleteId = valider.identifiant(req.params.athleteId, "L'athlète");
  await verifierAthleteDuCoach(req.user.id, athleteId);

  const body = req.body ?? {};
  const allure = { min: 120, max: 1200, optionnel: true };
  const fc = { min: 60, max: 230, optionnel: true };
  const s = {
    sv1Allure: valider.entier(body.sv1Allure, 'L’allure SV1 (2:00 à 20:00 /km)', allure),
    sv1Fc: valider.entier(body.sv1Fc, 'La FC SV1', fc),
    sv2Allure: valider.entier(body.sv2Allure, 'L’allure SV2 (2:00 à 20:00 /km)', allure),
    sv2Fc: valider.entier(body.sv2Fc, 'La FC SV2', fc),
  };
  // SV2 est un seuil plus intense que SV1 : allure plus rapide (moins de secondes par km)
  // et fréquence cardiaque plus élevée.
  if (s.sv1Allure && s.sv2Allure && s.sv2Allure >= s.sv1Allure) {
    throw new HttpError(400, 'L’allure SV2 doit être plus rapide que l’allure SV1.');
  }
  if (s.sv1Fc && s.sv2Fc && s.sv2Fc <= s.sv1Fc) {
    throw new HttpError(400, 'La FC à SV2 doit être plus élevée que la FC à SV1.');
  }

  await pool.query(
    `INSERT INTO seuils (athlete_id, sv1_allure_sec, sv1_fc, sv2_allure_sec, sv2_fc)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (athlete_id) DO UPDATE
     SET sv1_allure_sec = EXCLUDED.sv1_allure_sec, sv1_fc = EXCLUDED.sv1_fc,
         sv2_allure_sec = EXCLUDED.sv2_allure_sec, sv2_fc = EXCLUDED.sv2_fc, date_maj = now()`,
    [athleteId, s.sv1Allure, s.sv1Fc, s.sv2Allure, s.sv2Fc],
  );
  res.json(await lireProfil(athleteId));
});

export default router;
