/**
 * Un geste du guide, avec les libellés de boutons entre « » mis en gras : c'est
 * ce que l'œil doit retrouver à l'écran. Espaces insécables collées aux
 * guillemets : jamais de « seul en fin de ligne.
 */
export function TexteGeste({ texte }: { texte: string }) {
  const morceaux = texte.split(/(« [^»]+ »)/g);
  return (
    <>
      {morceaux.map((m, i) => (m.startsWith('« ')
        ? (
          <strong
            key={i}
            className="font-semibold"
            style={{ color: 'var(--color-ink)', background: 'rgba(43,184,154,0.08)', borderRadius: 4, padding: '0 3px' }}
          >
            {m.replace('« ', '«\u00A0').replace(' »', '\u00A0»')}
          </strong>
        )
        : <span key={i}>{m}</span>))}
    </>
  );
}
