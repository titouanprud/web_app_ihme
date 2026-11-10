import { createContext, useContext } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';

// Glisser-déposer avec @dnd-kit/core. Principe :
// - <DndContext> (dans la page) surveille le pointeur (souris ou doigt) et appelle onDragEnd
//   quand on lâche un élément, avec "active" (ce qu'on déplace) et "over" (où on le lâche) ;
// - useDraggable rend un élément déplaçable : il donne une ref et des écouteurs à poser dessus ;
// - useDroppable déclare une zone de dépôt (ici un jour du calendrier) ;
// - chaque élément porte des "data" (le modèle, la séance, la date) lues dans onDragEnd.
// Contrairement au glisser-déposer natif du navigateur, cela fonctionne aussi au doigt sur mobile.

// true quand le glisser-déposer est actif (calendrier de planification du coach)
export const GlisserDeposerActif = createContext(false);

// Un jour du calendrier sur lequel on peut déposer un modèle ou une séance
export function ZoneJour({ jour, className = '', children, ...props }) {
  const actif = useContext(GlisserDeposerActif);
  const { setNodeRef, isOver } = useDroppable({
    id: `jour-${jour}`,
    data: { date: jour },
    disabled: !actif,
  });
  return (
    <div ref={setNodeRef} className={`${className}${isOver ? ' zone-survolee' : ''}`} {...props}>
      {children}
    </div>
  );
}

// Élément que l'on peut déplacer. "data" décrit ce qui est déplacé, ex. { type: 'modele', modele }.
// L'aperçu qui suit le pointeur est affiché par <DragOverlay> dans la page : l'élément
// d'origine reste en place, simplement estompé pendant le déplacement.
// Seuls les écouteurs sont posés (pas les attributs d'accessibilité de dnd-kit) : l'élément
// contient déjà un bouton, qui reste utilisable au clavier pour ouvrir la séance.
export function Deplacable({ id, data, children, className = '' }) {
  const actif = useContext(GlisserDeposerActif);
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id,
    data,
    disabled: !actif,
  });
  if (!actif) return children;
  return (
    <div
      ref={setNodeRef}
      className={`deplacable${isDragging ? ' en-deplacement' : ''} ${className}`}
      {...listeners}
    >
      {children}
    </div>
  );
}
