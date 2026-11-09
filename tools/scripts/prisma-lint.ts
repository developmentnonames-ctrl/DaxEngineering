import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PLATFORM_FOLDERS = new Set(['auth', 'core', 'audit']);

interface Block {
  kind: 'model' | 'enum';
  name: string;
  folder: string;
  file: string;
  body: string;
}

export function parseBlocks(
  source: string,
  folder: string,
  file: string,
): Block[] {
  const blocks: Block[] = [];
  const re = /^\s*(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm;
  for (const match of source.matchAll(re)) {
    blocks.push({
      kind: match[1] as Block['kind'],
      name: match[2],
      folder,
      file,
      body: match[3],
    });
  }
  return blocks;
}

export function lintBlocks(blocks: Block[]): string[] {
  const problems: string[] = [];
  const folderOf = new Map(
    blocks.filter((b) => b.kind === 'model').map((b) => [b.name, b.folder]),
  );

  for (const block of blocks) {
    const declared = /@@schema\("([^"]+)"\)/.exec(block.body)?.[1];
    if (declared !== block.folder) {
      problems.push(
        `${block.file}: ${block.kind} ${block.name} must declare @@schema("${block.folder}")` +
          (declared ? ` (found "${declared}")` : ''),
      );
    }
    if (block.kind !== 'model') continue;

    for (const line of block.body.split('\n')) {
      const field = /^\s*(\w+)\s+(\w+)(\[\])?\??/.exec(line);
      if (
        !field ||
        line.trim().startsWith('//') ||
        line.trim().startsWith('@@')
      )
        continue;
      const target = folderOf.get(field[2]);
      if (!target || target === block.folder) continue;
      const bothPlatform =
        PLATFORM_FOLDERS.has(target) && PLATFORM_FOLDERS.has(block.folder);
      if (!bothPlatform) {
        problems.push(
          `${block.file}: ${block.name}.${field[1]} relates to ${field[2]} in "${target}". ` +
            'Cross-module references must be plain uuid columns, not relations.',
        );
      }
    }
  }
  return problems;
}

export function lintMigrations(
  migrationsDir: string,
  modules: Set<string>,
): string[] {
  if (!existsSync(migrationsDir)) return [];
  const problems: string[] = [];
  for (const entry of readdirSync(migrationsDir)) {
    const full = join(migrationsDir, entry);
    if (!statSync(full).isDirectory()) continue;
    const name = /^\d+_([a-z0-9]+)_/.exec(entry)?.[1];
    if (!name || !modules.has(name)) {
      problems.push(
        `migrations/${entry}: name must be <timestamp>_<module>_<what>, module one of: ${[...modules].join(', ')}`,
      );
    }
  }
  return problems;
}

function main(): void {
  const prismaDir = process.argv[2];
  if (!prismaDir) throw new Error('usage: prisma-lint <prisma dir>');
  const schemaDir = join(prismaDir, 'schema');

  const blocks: Block[] = [];
  const folders = new Set<string>();
  for (const folder of readdirSync(schemaDir)) {
    const dir = join(schemaDir, folder);
    if (!statSync(dir).isDirectory()) continue;
    folders.add(folder);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.prisma'))) {
      const path = join(dir, file);
      blocks.push(
        ...parseBlocks(
          readFileSync(path, 'utf8'),
          folder,
          relative(process.cwd(), path),
        ),
      );
    }
  }

  const problems = [
    ...lintBlocks(blocks),
    ...lintMigrations(
      join(prismaDir, 'migrations'),
      new Set([...folders, 'platform']),
    ),
  ];
  if (problems.length) {
    console.error(
      `prisma-lint found ${problems.length} problem(s):\n  ${problems.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    `prisma-lint: ${blocks.length} models/enums in ${folders.size} module folders OK`,
  );
}

if (process.argv[1] && /prisma-lint\.ts$/.test(process.argv[1])) main();
