// Reports static className strings that contain conflicting Tailwind utilities, i.e. classes
// tailwind-merge (with the app's theme) would drop. Their winner depends on CSS order, not intent.
// Run: node --experimental-strip-types scripts/lint-classes.ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cn } from '../packages/web/src/lib/utils.ts';

const root = 'packages/web/src';
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
};
walk(root);
let problems = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const strings = [...src.matchAll(/className="([^"]+)"/g), ...src.matchAll(/'([^'\n]*(?:\s[a-z[][^'\n]*){2,})'/g)].map((m) => m[1]!);
  for (const s of strings) {
    const tokens = s.split(/\s+/).filter(Boolean);
    const merged = new Set(cn(s).split(/\s+/));
    // An arbitrary font size (text-[…]) sets no line-height, so a leading-[…] beside it is not a conflict.
    const dropped = tokens.filter((t) => !merged.has(t) && !(t.startsWith('leading-') && tokens.some((x) => /^text-\[[\d.]+(rem|px|em)\]$/.test(x))));
    if (dropped.length) {
      problems++;
      const line = src.slice(0, src.indexOf(s)).split('\n').length;
      console.log(`${file}:${line}  drops ${dropped.join(' ')}`);
    }
  }
}
console.log(problems ? `${problems} class strings with conflicting utilities` : 'no conflicting utilities');
process.exit(problems ? 1 : 0);
