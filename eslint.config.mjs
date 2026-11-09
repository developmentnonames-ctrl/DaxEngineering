import nx from '@nx/eslint-plugin';

const moduleScope = (scope) => ({
  sourceTag: `scope:${scope}`,
  onlyDependOnLibsWithTags: [
    `scope:${scope}`,
    'scope:platform',
    'scope:shared',
    'type:contract',
  ],
});

const serverPackages = [
  '@nestjs/*',
  '@prisma/*',
  'prisma',
  'pg',
  'pg-boss',
  'nestjs-cls',
  '@nestjs-cls/*',
];
const browserPackages = ['next', 'next/*', 'react', 'react-dom', '@mantine/*'];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      '**/test-output',
      '**/.next',
      '**/generated/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'type:contract',
              onlyDependOnLibsWithTags: ['type:contract', 'type:util'],
              bannedExternalImports: [...serverPackages, ...browserPackages],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util'],
              bannedExternalImports: [...serverPackages, ...browserPackages],
            },
            {
              sourceTag: 'type:data',
              onlyDependOnLibsWithTags: ['type:util', 'type:contract'],
              bannedExternalImports: browserPackages,
            },
            {
              sourceTag: 'type:server',
              onlyDependOnLibsWithTags: [
                'type:server',
                'type:data',
                'type:contract',
                'type:util',
              ],
              bannedExternalImports: browserPackages,
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: ['type:contract', 'type:util'],
              bannedExternalImports: serverPackages,
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:contract',
                'type:util',
              ],
              bannedExternalImports: serverPackages,
            },
            {
              sourceTag: 'type:web',
              onlyDependOnLibsWithTags: [
                'type:web',
                'type:data-access',
                'type:ui',
                'type:contract',
                'type:util',
              ],
              bannedExternalImports: serverPackages,
            },
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['*'] },
            { sourceTag: 'type:e2e', onlyDependOnLibsWithTags: ['*'] },

            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:platform',
              onlyDependOnLibsWithTags: ['scope:platform', 'scope:shared'],
            },
            moduleScope('parties'),
            moduleScope('inventory'),
            { sourceTag: 'scope:app', onlyDependOnLibsWithTags: ['*'] },
          ],
        },
      ],
    },
  },
  {
    // Next.js caching can serve one user's permission-filtered data to another user.
    files: [
      'apps/web/**/*.{ts,tsx}',
      'apps/admin/**/*.{ts,tsx}',
      'libs/*/web/**/*.{ts,tsx}',
      'libs/web-platform/**/*.{ts,tsx}',
      'libs/shared/ui/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/cache',
              importNames: ['unstable_cache', 'cacheLife', 'cacheTag'],
              message:
                'Shared caches can leak permissioned data between users. Fetch per request with no-store.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "ExpressionStatement[directive='use cache']",
          message:
            "'use cache' can leak permissioned data between users. Fetch per request with no-store.",
        },
        {
          selector: "Property[key.name='cache'][value.value='force-cache']",
          message:
            "cache: 'force-cache' can leak permissioned data between users. Use 'no-store'.",
        },
      ],
    },
  },
];
