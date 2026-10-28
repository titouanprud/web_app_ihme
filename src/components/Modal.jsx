import { useEffect } from 'react';

// Fenêtre par-dessus la page. Se ferme avec Échap, la croix ou un clic à côté.
// large : fenêtre plus large (formulaire de séance), qui ne se ferme pas sur un clic
// à côté pour ne pas perdre une saisie longue par erreur.
export default function Modal({ titre, onClose, children, large = false }) {
  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);

  return (
    <div
      className="modal-fond"
      onMouseDown={(e) => !large && e.target === e.currentTarget && onClose()}
    >
      <div
        className={`modal${large ? ' modal-large' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titre"
      >
        <div className="modal-entete">
          <h2 id="modal-titre">{titre}</h2>
          <button type="button" className="btn-fermer" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
