import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['apps/web/src', 'apps/admin/src', 'libs', 'docs'];
const LIB_PARTS = new Set(['web', 'ui', 'shell', 'contract', 'data-access']);
const EXTENSIONS = /\.(tsx?|md|mdx|json)$/;
const SKIP = /(node_modules|\.next|dist|generated|\.spec\.|\.test\.)/;

interface Rule {
  name: string;
  pattern: RegExp;
}

export function buildRules(names: string[]): Rule[] {
  const rules: Rule[] = [
    {
      name: 'document register code',
      pattern:
        /\b(?:P[1-7]|C(?:1[0-9]|2[0-2]|[1-9])|S[1-7]|A1|E(?:1[01]|[1-9]))\b/,
    },
    {
      name: 'process map reference',
      pattern: /process[\s_-]*maps?\b|\bmap\s+0?\d\b/i,
    },
  ];
  if (names.length) {
    rules.push({
      name: 'personal name',
      pattern: new RegExp(`\\b(?:${names.join('|')})\\b`, 'i'),
    });
  }
  return rules;
}

export function lintText(
  text: string,
  rules: Rule[],
): { line: number; rule: string; text: string }[] {
  const hits: { line: number; rule: string; text: string }[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes('copy-lint-ignore')) return;
    for (const rule of rules) {
      if (rule.pattern.test(line))
        hits.push({
          line: i + 1,
          rule: rule.name,
          text: line.trim().slice(0, 120),
        });
    }
  });
  return hits;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.test(entry)) yield full;
  }
}

function isUserFacing(path: string): boolean {
  const parts = path.split(/[\\/]/);
  if (parts[0] !== 'libs') return true;
  return LIB_PARTS.has(parts[2]);
}

function main(): void {
  const configPath = join(__dirname, 'copy-lint.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    names: string[];
  };
  const rules = buildRules(config.names);

  const problems: string[] = [];
  let files = 0;
  for (const root of ROOTS) {
    if (!existsSync(root)) continue;
    for (const file of walk(root)) {
      const rel = relative(process.cwd(), file);
      if (!isUserFacing(rel)) continue;
      files++;
      for (const hit of lintText(readFileSync(file, 'utf8'), rules)) {
        problems.push(`${rel}:${hit.line} ${hit.rule}: ${hit.text}`);
      }
    }
  }
  if (problems.length) {
    console.error(
      `copy-lint found ${problems.length} problem(s):\n  ${problems.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(`copy-lint: ${files} files OK`);
}

if (process.argv[1] && /copy-lint\.ts$/.test(process.argv[1])) main();
