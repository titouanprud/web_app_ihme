import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formaterChrono, lireChrono } from '../blocs.js';
import { formaterDate } from '../dates.js';
import ChampTexteValide from './ChampTexteValide.jsx';
import { ErrorMessage, Loading } from './Feedback.jsx';

// Profil sportif : records (saisis par l'athlète) et seuils SV1 / SV2 (estimés par le coach).

export const DISTANCES = [
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

// Tableau des records avec l'allure moyenne de chacun
export function RecordsLecture({ records }) {
  if (records.length === 0) {
    return <p className="texte-discret">Aucun record renseigné pour l’instant.</p>;
  }
  return (
    <table className="tableau">
      <thead>
        <tr>
          <th>Distance</th>
          <th>Temps</th>
          <th>Allure moyenne</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {DISTANCES.map((d) => {
          const r = records.find((x) => x.distance === d.value);
          if (!r) return null;
          return (
            <tr key={d.value}>
              <td>{d.label}</td>
              <td>
                <strong>{formaterChrono(r.tempsSec)}</strong>
              </td>
              <td>{formaterChrono(allureMoyenne(r.tempsSec, d.metres))} /km</td>
              <td>
                {r.date
                  ? formaterDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })
                  : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// Formulaire de l'athlète pour ses records
export function RecordsForm({ records, onEnregistre }) {
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
      const profil = await api('profil/records', { method: 'PUT', body: { records: liste } });
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
                placeholder={d.value === '5k' || d.value === '10k' ? 'mm:ss' : 'h:mm:ss'}
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
          {envoi ? 'Enregistrement…' : 'Enregistrer mes records'}
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

// Bloc "Profil sportif" affiché sur la page d'un athlète côté coach
export function ProfilAthleteCoach({ athleteId }) {
  const { profil, setProfil, erreur } = useProfil(athleteId);
  return (
    <details className="carte profil-coach">
      <summary>
        <strong>Profil sportif</strong>
        <span className="texte-discret"> · records et seuils SV1 / SV2</span>
      </summary>
      <ErrorMessage message={erreur} />
      {!profil && !erreur && <Loading />}
      {profil && (
        <div className="profil-coach-contenu">
          <section>
            <h3>Records de l’athlète</h3>
            <RecordsLecture records={profil.records} />
          </section>
          <section>
            <h3>Mon estimation des seuils</h3>
            <SeuilsForm athleteId={athleteId} seuils={profil.seuils} onEnregistre={setProfil} />
          </section>
        </div>
      )}
    </details>
  );
}
