import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formaterChrono, lireChrono, vitesseCritique, zonesDepuisSeuils } from '../blocs.js';
import ChampTexteValide from './ChampTexteValide.jsx';
import { ErrorMessage, Loading } from './Feedback.jsx';

// Profil sportif : records (saisis par l'athlète ou son coach), vitesse critique (calculée),
// seuils SV1 / SV2 et zones 1 à 5 (estimés par le coach).

export const DISTANCES = [
  { value: '1200m', label: '1 200 m', metres: 1200 },
  { value: '3600m', label: '3 600 m', metres: 3600 },
  { value: '5k', label: '5 km', metres: 5000 },
  { value: '10k', label: '10 km', metres: 10000 },
  { value: 'semi', label: 'Semi-marathon', metres: 21097 },
  { value: 'marathon', label: 'Marathon', metres: 42195 },
];

// Lecture d'un temps de course : "45:12" ou "1:35:20" (un nombre seul n'est pas accepté ici)
const lireTemps = (texte) => (texte.includes(':') ? lireChrono(texte) : null);

// Allure moyenne d'un record, en secondes par km
function allureMoyenne(tempsSec, metres) {
  return Math.round(tempsSec / (metres / 1000));
}

// Charge le profil d'un athlète (athleteId côté coach, rien côté athlète)
export function useProfil(athleteId) {
  const [profil, setProfil] = useState(null);
  const [erreur, setErreur] = useState('');
  useEffect(() => {
    api(athleteId ? `profil?athleteId=${athleteId}` : 'profil')
      .then(setProfil)
      .catch((err) => setErreur(err.message));
  }, [athleteId]);
  return { profil, setProfil, erreur };
}

// Formulaire des records : l'athlète pour lui-même, ou le coach pour un de ses athlètes
// (athleteId) ou pour lui-même (sans athleteId)
export function RecordsForm({ records, onEnregistre, athleteId = null }) {
  // Une ligne par distance : { tempsSec, date }
  const [valeurs, setValeurs] = useState(() =>
    Object.fromEntries(
      DISTANCES.map((d) => {
        const r = records.find((x) => x.distance === d.value);
        return [d.value, { tempsSec: r?.tempsSec ?? null, date: r?.date ?? '' }];
      }),
    ),
  );
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const changer = (distance, modif) =>
    setValeurs({ ...valeurs, [distance]: { ...valeurs[distance], ...modif } });

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    setSucces('');
    // Seules les distances avec un temps sont envoyées
    const liste = DISTANCES.filter((d) => valeurs[d.value].tempsSec).map((d) => ({
      distance: d.value,
      tempsSec: valeurs[d.value].tempsSec,
      date: valeurs[d.value].date || null,
    }));
    try {
      const chemin = athleteId ? `profil/records?athleteId=${athleteId}` : 'profil/records';
      const profil = await api(chemin, { method: 'PUT', body: { records: liste } });
      onEnregistre(profil);
      setSucces('Records enregistrés.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <ErrorMessage message={erreur} />
      {succes && (
        <p className="success" role="status">
          {succes}
        </p>
      )}
      {DISTANCES.map((d) => {
        const v = valeurs[d.value];
        return (
          <div key={d.value} className="ligne-record">
            <strong className="ligne-record-distance">{d.label}</strong>
            <label>
              Temps
              <ChampTexteValide
                value={v.tempsSec}
                onChange={(tempsSec) => changer(d.value, { tempsSec })}
                formater={formaterChrono}
                lire={lireTemps}
                optionnel
                placeholder={d.metres <= 10000 ? 'mm:ss' : 'h:mm:ss'}
              />
            </label>
            <label>
              Date (option)
              <input
                type="date"
                value={v.date}
                onChange={(e) => changer(d.value, { date: e.target.value })}
              />
            </label>
            <span className="texte-discret ligne-record-allure">
              {v.tempsSec ? `${formaterChrono(allureMoyenne(v.tempsSec, d.metres))} /km` : ''}
            </span>
          </div>
        );
      })}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer les records'}
        </button>
      </div>
    </form>
  );
}

// Vitesse critique (VC), calculée à partir des records sur 1200 m et 3600 m
export function VitesseCritique({ records }) {
  const vc = vitesseCritique(records);
  const ont = (d) => records.some((r) => r.distance === d);
  if (!vc) {
    return (
      <p className="texte-discret">
        {ont('1200m') && ont('3600m')
          ? 'Records 1200 m et 3600 m incohérents : le 3600 m doit être couru moins vite.'
          : 'Renseignez les records sur 1200 m et 3600 m pour calculer la vitesse critique.'}
      </p>
    );
  }
  return (
    <div className="seuils">
      <div className="seuil">
        <span className="seuil-nom">VC</span>
        <strong>{formaterChrono(vc.allureSec)} /km</strong>
        <span className="texte-discret">{String(vc.kmh).replace('.', ',')} km/h</span>
      </div>
      <span className="texte-discret">
        D′ ≈ {vc.dPrimeM} m · calculée avec les records 1200 m et 3600 m. Utilisable dans les
        séances avec @VC.
      </span>
    </div>
  );
}

// ----- Zones 1 à 5 -----

const ZONES = [1, 2, 3, 4, 5];

// Fourchette de FC lisible : "140 – 150", "≥ 175", "≤ 140"
function fourchetteFc(min, max) {
  if (min && max) return `${min} – ${max}`;
  if (min) return `≥ ${min}`;
  if (max) return `≤ ${max}`;
  return '—';
}

export function ZonesLecture({ zones }) {
  if (!zones?.length) {
    return <p className="texte-discret">Zones pas encore définies.</p>;
  }
  return (
    <table className="tableau tableau-zones">
      <thead>
        <tr>
          <th>Zone</th>
          <th>Allure (/km)</th>
          <th>FC (bpm)</th>
        </tr>
      </thead>
      <tbody>
        {ZONES.map((n) => {
          const z = zones.find((x) => x.zone === n) ?? {};
          // Allure : la borne "max" (en secondes) est la plus lente ; Z1 = plus lent que…
          const allure =
            z.allureMin && z.allureMax
              ? `${formaterChrono(z.allureMin)} – ${formaterChrono(z.allureMax)}`
              : z.allureMin
                ? `plus lent que ${formaterChrono(z.allureMin)}`
                : z.allureMax
                  ? `plus vite que ${formaterChrono(z.allureMax)}`
                  : '—';
          return (
            <tr key={n} className={`zone-${n}`}>
              <td>
                <strong>Z{n}</strong>
              </td>
              <td>{allure}</td>
              <td>{fourchetteFc(z.fcMin, z.fcMax)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Formulaire du coach : allure et FC de chaque zone, avec une proposition calculée
// depuis SV1 / SV2 (modifiable ensuite)
export function ZonesForm({ athleteId, zones, seuils, onEnregistre }) {
  const depuis = (liste) =>
    ZONES.map((n) => {
      const z = liste?.find((x) => x.zone === n) ?? {};
      return {
        zone: n,
        allureMin: z.allureMin ?? null,
        allureMax: z.allureMax ?? null,
        fcMin: z.fcMin ?? '',
        fcMax: z.fcMax ?? '',
      };
    });
  const [valeurs, setValeurs] = useState(() => depuis(zones));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const changer = (n, modif) =>
    setValeurs(valeurs.map((z) => (z.zone === n ? { ...z, ...modif } : z)));
  const nombre = (v) => (v === '' || v === null ? null : Number(v));
  const avecSeuils = seuils && (seuils.sv1Allure || seuils.sv2Allure || seuils.sv1Fc);

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const profil = await api(`profil/zones/${athleteId}`, {
        method: 'PUT',
        body: {
          zones: valeurs.map((z) => ({ ...z, fcMin: nombre(z.fcMin), fcMax: nombre(z.fcMax) })),
        },
      });
      onEnregistre(profil);
      setSucces('Zones enregistrées : elles servent aux allures des cibles en zone.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="form" onSubmit={envoyer}>
      <ErrorMessage message={erreur} />
      {succes && (
        <p className="success" role="status">
          {succes}
        </p>
      )}
      {avecSeuils && (
        <button
          type="button"
          className="btn btn-ghost btn-petit"
          onClick={() => setValeurs(depuis(zonesDepuisSeuils(seuils)))}
        >
          Proposer à partir de SV1 / SV2
        </button>
      )}
      <div className="defilement-x">
        <table className="tableau tableau-zones">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Allure de</th>
              <th>à</th>
              <th>FC de</th>
              <th>à</th>
            </tr>
          </thead>
          <tbody>
            {valeurs.map((z) => (
              <tr key={z.zone} className={`zone-${z.zone}`}>
                <td>
                  <strong>Z{z.zone}</strong>
                </td>
                <td>
                  <ChampTexteValide
                    value={z.allureMin}
                    onChange={(allureMin) => changer(z.zone, { allureMin })}
                    formater={formaterChrono}
                    lire={lireTemps}
                    optionnel
                    placeholder="rapide"
                    aria-label={`Z${z.zone} : allure la plus rapide`}
                  />
                </td>
                <td>
                  <ChampTexteValide
                    value={z.allureMax}
                    onChange={(allureMax) => changer(z.zone, { allureMax })}
                    formater={formaterChrono}
                    lire={lireTemps}
                    optionnel
                    placeholder="lente"
                    aria-label={`Z${z.zone} : allure la plus lente`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={40}
                    max={230}
                    value={z.fcMin}
                    onChange={(e) => changer(z.zone, { fcMin: e.target.value })}
                    aria-label={`Z${z.zone} : FC basse`}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={40}
                    max={230}
                    value={z.fcMax}
                    onChange={(e) => changer(z.zone, { fcMax: e.target.value })}
                    aria-label={`Z${z.zone} : FC haute`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="texte-discret">
        Allures en min/km, de la plus rapide à la plus lente. Une zone sans allure garde une
        distance indicative dans les séances.
      </p>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer les zones'}
        </button>
      </div>
    </form>
  );
}

// Seuils en lecture seule (vue de l'athlète, et vue du coach hors modification)
export function SeuilsLecture({ seuils }) {
  if (!seuils || (!seuils.sv1Allure && !seuils.sv2Allure && !seuils.sv1Fc && !seuils.sv2Fc)) {
    return <p className="texte-discret">Pas encore d’estimation de SV1 / SV2.</p>;
  }
  const ligne = (nom, allure, fc) => (
    <div className="seuil">
      <span className="seuil-nom">{nom}</span>
      <strong>{allure ? `${formaterChrono(allure)} /km` : '—'}</strong>
      <span className="texte-discret">{fc ? `${fc} bpm` : ''}</span>
    </div>
  );
  return (
    <div className="seuils">
      {ligne('SV1', seuils.sv1Allure, seuils.sv1Fc)}
      {ligne('SV2', seuils.sv2Allure, seuils.sv2Fc)}
      <span className="texte-discret">
        Mis à jour le {new Date(seuils.dateMaj).toLocaleDateString('fr-FR')}
      </span>
    </div>
  );
}

// Formulaire du coach pour estimer SV1 / SV2
export function SeuilsForm({ athleteId, seuils, onEnregistre }) {
  const [valeurs, setValeurs] = useState({
    sv1Allure: seuils?.sv1Allure ?? null,
    sv1Fc: seuils?.sv1Fc ?? '',
    sv2Allure: seuils?.sv2Allure ?? null,
    sv2Fc: seuils?.sv2Fc ?? '',
  });
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const changer = (modif) => setValeurs({ ...valeurs, ...modif });
  const nombre = (v) => (v === '' ? null : Number(v));

  async function envoyer(e) {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    setSucces('');
    try {
      const profil = await api(`profil/seuils/${athleteId}`, {
        method: 'PUT',
        body: { ...valeurs, sv1Fc: nombre(valeurs.sv1Fc), sv2Fc: nombre(valeurs.sv2Fc) },
      });
      onEnregistre(profil);
      setSucces('Seuils enregistrés : l’athlète les voit dans son profil.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  const champs = (nom, cleAllure, cleFc) => (
    <div className="ligne-record">
      <strong className="ligne-record-distance">{nom}</strong>
      <label>
        Allure (min/km)
        <ChampTexteValide
          value={valeurs[cleAllure]}
          onChange={(v) => changer({ [cleAllure]: v })}
          formater={formaterChrono}
          lire={lireTemps}
          optionnel
          placeholder="ex. 4:45"
        />
      </label>
      <label>
        FC (bpm, option)
        <input
          type="number"
          min={60}
          max={230}
          value={valeurs[cleFc]}
          onChange={(e) => changer({ [cleFc]: e.target.value })}
        />
      </label>
    </div>
  );

  return (
    <form className="form" onSubmit={envoyer}>
      <ErrorMessage message={erreur} />
      {succes && (
        <p className="success" role="status">
          {succes}
        </p>
      )}
      {champs('SV1', 'sv1Allure', 'sv1Fc')}
      {champs('SV2', 'sv2Allure', 'sv2Fc')}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer les seuils'}
        </button>
      </div>
    </form>
  );
}

// Bloc "Profil sportif" affiché sur la page d'un athlète côté coach.
// Le profil est chargé par la page (useProfil), qui s'en sert aussi pour les allures de référence.
// Le coach saisit les records de l'athlète (ou les siens : moi = true), ses seuils et ses zones.
export function ProfilAthleteCoach({ athleteId, profil, setProfil, erreur, moi = false }) {
  return (
    <details className="carte profil-coach">
      <summary>
        <strong>Profil sportif</strong>
        <span className="texte-discret"> · records, vitesse critique, seuils et zones</span>
      </summary>
      <ErrorMessage message={erreur} />
      {!profil && !erreur && <Loading />}
      {profil && (
        <div className="profil-coach-contenu">
          <section>
            <h3>{moi ? 'Mes records' : 'Records de l’athlète'}</h3>
            <RecordsForm
              records={profil.records}
              onEnregistre={setProfil}
              athleteId={moi ? null : athleteId}
            />
          </section>
          <section>
            <h3>Vitesse critique</h3>
            <VitesseCritique records={profil.records} />
            <h3>{moi ? 'Mes seuils' : 'Mon estimation des seuils'}</h3>
            <SeuilsForm athleteId={athleteId} seuils={profil.seuils} onEnregistre={setProfil} />
          </section>
          <section className="profil-zones">
            <h3>Zones 1 à 5</h3>
            <ZonesForm
              athleteId={athleteId}
              zones={profil.zones}
              seuils={profil.seuils}
              onEnregistre={setProfil}
            />
          </section>
        </div>
      )}
    </details>
  );
}
