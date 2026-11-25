// Remonte en haut de la zone qui défile réellement. Dans l'application, c'est
// la div de App.tsx (overflow auto), pas la fenêtre : window.scrollTo n'y fait
// rien. Utilisé par les formulaires en étapes à chaque changement d'étape
// (compte rendu de Pierre, 25/11/2026 ; même demande pour le bilan).
export
function remonterEnHaut(depuis: HTMLElement | null) {
  let el = depuis?.parentElement ?? null;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0 });
      return;
    }
    el = el.parentElement;
  }
  window.scrollTo({ top: 0 });
}
