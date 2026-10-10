export const SYMBOLS = [
  '●', '■', '▲', '◆', '★', '✚', '✖', '♥', '♠', '♣', '♦', '☀', '☾', '✿', '❖', '▼',
  '◐', '◑', '□', '△', '○', '◇', '☆', '♪', '✈', '⚑', '☂', '☎', '✂', '✦', '✧', '⬟',
  'A', 'B', 'C', 'D', 'E', 'F', 'H', 'K', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'W',
  'X', 'Y', 'Z', '2', '3', '4', '5', '6', '7', '8', '9', '#', '%', '&', '?', '@',
];

export function nextSymbol(used: string[]): string {
  const taken = new Set(used);
  for (const s of SYMBOLS) if (!taken.has(s)) return s;
  return String((taken.size % 90) + 10);
}
