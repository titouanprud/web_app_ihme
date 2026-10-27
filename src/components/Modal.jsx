import { useEffect } from 'react';

// Fenêtre par-dessus la page. Se ferme avec Échap, la croix ou un clic à côté.
export default function Modal({ titre, onClose, children }) {
  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onClose]);

  return (
    <div className="modal-fond" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titre">
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
