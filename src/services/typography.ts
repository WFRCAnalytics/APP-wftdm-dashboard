// Display-only typography: sequences people type in ASCII read as the one symbol they stand for ("Autos >= Workers" shows
// "Autos ≥ Workers"). Apply it only where text is DRAWN (labels, legends, tooltips), never to a value that is queried,
// filtered, compared or exported, and never to SQL or code. Every rule is conservative: where a sequence could mean
// something else ("a<-5" is "less than minus five", "A-1" is an id), it is left alone.
//
//   comparison   >=  ≥    <=  ≤    !=  ≠    <>  ≠    ~=  ≈
//   plus/minus   +/-  ±    +-  ±
//   arrows       ->  →    <-  ←    <->  ↔    =>  ⇒    <=>  ⇔
//   punctuation  ...  …    --  –    ---  —
//   minus sign   -5 at the start of a word or after "(" or a space  →  −5 (a true minus, not a hyphen)
//   spaced ranges  "10 - 20"  →  "10 – 20" (digits on both sides, spaces around)
const RULES: [RegExp, string][] = [
  [/<=>/g, '⇔'],
  [/<->/g, '↔'],
  [/>=/g, '≥'],
  [/<=(?!>)/g, '≤'],
  [/!=/g, '≠'],
  [/<>/g, '≠'],
  [/~=/g, '≈'],
  [/\+\/-/g, '±'],
  [/\+-(?=\d)/g, '±'],
  [/=>/g, '⇒'],
  [/->/g, '→'],
  [/(^|\s)<-(?=\s|$)/g, '$1←'],
  [/(?<!\.)\.{3}(?!\.)/g, '…'],
  [/(?<!-)---(?!-)/g, '—'],
  [/(?<!-)--(?!-)/g, '–'],
  [/(\d) - (?=\d)/g, '$1 – '],
  [/(^|[\s(])-(?=\d)/g, '$1−'],
]

const TRIGGER = /[<>!=~+.\-]/

export function prettyOperators(text: string): string {
  if (!TRIGGER.test(text)) return text
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to)
  return out
}
