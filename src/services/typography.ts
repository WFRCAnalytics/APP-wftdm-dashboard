// Display-only typography: operators typed as two characters read as the one symbol they stand for ("Autos >= Workers"
// shows "Autos ≥ Workers"). Apply it only where text is drawn, never to a value that is queried, filtered or compared.
const SYMBOLS: [RegExp, string][] = [
  [/>=/g, '≥'],
  [/<=/g, '≤'],
  [/!=/g, '≠'],
  [/<>/g, '≠'],
  [/->/g, '→'],
]

export function prettyOperators(text: string): string {
  if (!/[<>!=-]/.test(text)) return text
  let out = text
  for (const [re, sym] of SYMBOLS) out = out.replace(re, sym)
  return out
}
