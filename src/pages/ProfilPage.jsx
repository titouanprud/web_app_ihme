import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import {
  RecordsForm,
  SeuilsLecture,
  useProfil,
  VitesseCritique,
  ZonesLecture,
} from '../components/ProfilSportif.jsx';

// Profil sportif de l'athlète : il saisit ses records (son coach peut aussi les saisir),
// voit sa vitesse critique et consulte ses seuils SV1 / SV2 et ses zones,
// estimés par son coach (non modifiables ici).
export default function ProfilPage() {
  const { profil, setProfil, erreur } = useProfil();

  return (
    <div className="page">
      <h1>Mon profil sportif</h1>
      <ErrorMessage message={erreur} />
      {!profil && !erreur && <Loading />}
      {profil && (
        <div className="profil-grille">
          <section className="carte section">
            <h2>Mes seuils</h2>
            <p className="texte-discret">
              Allures associées à vos seuils ventilatoires, estimées par votre coach.
            </p>
            <SeuilsLecture seuils={profil.seuils} />
            <h2>Ma vitesse critique</h2>
            <VitesseCritique records={profil.records} />
          </section>
          <section className="carte section">
            <h2>Mes zones</h2>
            <p className="texte-discret">
              Allures et fréquences cardiaques définies par votre coach.
            </p>
            <ZonesLecture zones={profil.zones} />
          </section>
          <section className="carte section">
            <h2>Mes records</h2>
            <p className="texte-discret">
              Temps au format mm:ss ou h:mm:ss. Votre coach peut les consulter et les compléter.
            </p>
            <RecordsForm records={profil.records} onEnregistre={setProfil} />
          </section>
        </div>
      )}
    </div>
  );
}
