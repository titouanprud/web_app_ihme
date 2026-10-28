import { useState } from 'react';

// Champ texte pour une valeur "spéciale" (chrono 4:30, distance 1,5 km…).
// - formater : valeur → texte affiché ; lire : texte → valeur (ou null si invalide)
// - optionnel : un champ vidé renvoie null au lieu de reprendre l'ancienne valeur
// La valeur n'est validée qu'en quittant le champ (ou avec Entrée), pour ne pas
// interrompre la saisie. Un texte invalide est remplacé par la dernière valeur correcte.
export default function ChampTexteValide({ value, onChange, formater, lire, optionnel, ...props }) {
  const [texte, setTexte] = useState(value === null ? '' : formater(value));
  const [valeurAffichee, setValeurAffichee] = useState(value);

  // Si la valeur change de l'extérieur (ex. blocs réordonnés), on met le texte à jour
  if (value !== valeurAffichee) {
    setValeurAffichee(value);
    setTexte(value === null ? '' : formater(value));
  }

  function valider() {
    if (texte.trim() === '') {
      if (optionnel) {
        if (value !== null) onChange(null);
      } else {
        setTexte(formater(value));
      }
      return;
    }
    const lue = lire(texte);
    if (lue === null) {
      setTexte(value === null ? '' : formater(value)); // saisie invalide : on revient en arrière
      return;
    }
    if (lue !== value) onChange(lue);
    setTexte(formater(lue));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault(); // Entrée valide le champ sans envoyer le formulaire
          valider();
        }
      }}
      {...props}
    />
  );
}
