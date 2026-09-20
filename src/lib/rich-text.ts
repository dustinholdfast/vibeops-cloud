export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; value: string };

export type RichBlock =
  | { type: 'p'; children: InlineToken[] }
  | { type: 'checklist'; checked: boolean; children: InlineToken[]; lineIndex: number };

const CHECKLIST = /^(\s*)- \[([ xX])\] (.*)$/;

export function isSafeHttpUrl(href: string): boolean {
  try {
    const url = new URL(href.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function nextSpecial(input: string, from: number): number {
  for (let i = from; i < input.length; i++) {
    const ch = input[i];
    if (ch === '`' || ch === '[') return i;
    if (ch === '*' && input[i + 1] === '*') return i;
    if (input.startsWith('http://', i) || input.startsWith('https://', i)) return i;
  }
  return input.length;
}

export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  while (i < input.length) {
    if (input.startsWith('**', i)) {
      const end = input.indexOf('**', i + 2);
      if (end > i + 2) {
        tokens.push({ type: 'bold', value: input.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (input[i] === '`') {
      const end = input.indexOf('`', i + 1);
      if (end > i) {
        tokens.push({ type: 'code', value: input.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (input[i] === '[') {
      const close = input.indexOf('](', i);
      const endParen = close === -1 ? -1 : input.indexOf(')', close + 2);
      if (close > i && endParen > close + 2) {
        const label = input.slice(i + 1, close);
        const href = input.slice(close + 2, endParen);
        if (label && isSafeHttpUrl(href)) {
          tokens.push({ type: 'link', href: href.trim(), value: label });
          i = endParen + 1;
          continue;
        }
      }
    }
    const rest = input.slice(i);
    const bare = rest.match(/^https?:\/\/[^\s<]+/i);
    if (bare && isSafeHttpUrl(bare[0])) {
      const href = bare[0].replace(/[),.;!?]+$/, '');
      tokens.push({ type: 'link', href, value: href });
      i += href.length;
      continue;
    }
    const next = nextSpecial(input, i + 1);
    tokens.push({ type: 'text', value: input.slice(i, next) });
    i = next;
  }
  return tokens;
}

export function parseRichText(input: string): RichBlock[] {
  const lines = input.split('\n');
  const blocks: RichBlock[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (!line.trim()) continue;
    const match = line.match(CHECKLIST);
    if (match) {
      blocks.push({
        type: 'checklist',
        checked: match[2].toLowerCase() === 'x',
        children: parseInline(match[3]),
        lineIndex,
      });
      continue;
    }
    blocks.push({ type: 'p', children: parseInline(line) });
  }
  return blocks;
}

/** Flip `- [ ]` / `- [x]` on one line. Returns the original text if that line is not a checklist. */
export function toggleChecklistLine(text: string, lineIndex: number): string {
  const lines = text.split('\n');
  const line = lines[lineIndex];
  if (line === undefined) return text;
  const match = line.match(CHECKLIST);
  if (!match) return text;
  const checked = match[2].toLowerCase() === 'x';
  lines[lineIndex] = `${match[1]}- [${checked ? ' ' : 'x'}] ${match[3]}`;
  return lines.join('\n');
}
