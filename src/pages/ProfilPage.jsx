import { ErrorMessage, Loading } from '../components/Feedback.jsx';
import { RecordsForm, SeuilsLecture, useProfil } from '../components/ProfilSportif.jsx';

// Profil sportif de l'athlète : il saisit ses records et consulte ses seuils
// SV1 / SV2, estimés par son coach (non modifiables ici).
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
          </section>
          <section className="carte section">
            <h2>Mes records</h2>
            <p className="texte-discret">
              Temps au format mm:ss ou h:mm:ss. Votre coach peut les consulter.
            </p>
            <RecordsForm records={profil.records} onEnregistre={setProfil} />
          </section>
        </div>
      )}
    </div>
  );
}
