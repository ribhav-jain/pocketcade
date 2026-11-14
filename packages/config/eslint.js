// Shared ESLint flat config: typescript-eslint's recommended rules, the import bans that keep the package
// boundaries, and a short sandbox for game code.
import tseslint from 'typescript-eslint';

const ui = ['react', 'react-dom', 'react/*', 'react-dom/*', 'next', 'next/*'];
const phaserTypesOnly = (message) => ({ name: 'phaser', allowTypeImports: true, message });

/** What each kind of package must not import. */
const bans = {
  sdk: {
    patterns: [
      { group: ['@pocketcade/*', 'phaser', ...ui], message: '@pocketcade/sdk depends on nothing.' },
    ],
  },
  host: {
    patterns: [
      {
        group: [
          'phaser',
          '@pocketcade/toolkit',
          '@pocketcade/toolkit/*',
          '@pocketcade/game-*',
          ...ui,
        ],
        message: '@pocketcade/host may depend only on @pocketcade/sdk.',
      },
    ],
  },
  toolkit: {
    patterns: [
      {
        group: ['@pocketcade/host', '@pocketcade/host/*', '@pocketcade/game-*', ...ui],
        message: 'Not allowed in @pocketcade/toolkit.',
      },
      { group: ['phaser'], message: 'Only src/phaser/** may reference Phaser.' },
    ],
  },
  game: {
    paths: [phaserTypesOnly('Games import Phaser types only; the toolkit loads the engine.')],
    patterns: [
      {
        group: [
          '@pocketcade/host',
          '@pocketcade/host/*',
          '@pocketcade/sdk/rules',
          '@pocketcade/game-*',
          ...ui,
        ],
        message: 'A game may import only @pocketcade/sdk, @pocketcade/toolkit and Phaser types.',
      },
    ],
  },
  web: {
    patterns: [
      {
        group: ['phaser', '@pocketcade/toolkit', '@pocketcade/toolkit/*', '@pocketcade/game-*'],
        message: 'The portal loads games only through src/games/*.generated.ts.',
      },
    ],
  },
  playground: {
    patterns: [{ group: ui, message: 'The playground is a plain Vite app: no React or Next.' }],
  },
};

const globals = (names, message) => names.map((name) => ({ name, message }));
const MUTABLE_STATE =
  'No module-level mutable state: create() must return a fresh game on every mount.';

/** A game lives inside its container and talks to the page only through the host. */
const gameSandbox = {
  'no-restricted-globals': [
    'error',
    ...globals(['localStorage', 'sessionStorage', 'indexedDB', 'cookieStore'], 'Use host.storage.'),
    ...globals(
      ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
      'Games make no network requests; bundle the asset.',
    ),
    ...globals(
      ['addEventListener', 'removeEventListener'],
      'Listen on the container, not on the window.',
    ),
  ],
  'no-restricted-properties': ['error', { property: 'cookie', message: 'Use host.storage.' }],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "MemberExpression[object.name='document']:not([property.name=/^(createElement|createElementNS|createTextNode)$/])",
      message: 'Stay inside the container: use document only to create elements.',
    },
    {
      selector: 'MemberExpression[object.name=/^(window|globalThis|self)$/]',
      message: 'Stay inside the container: no access through window, globalThis or self.',
    },
    { selector: 'Program > VariableDeclaration[kind=/^(let|var)$/]', message: MUTABLE_STATE },
    {
      selector: 'Program > ExportNamedDeclaration > VariableDeclaration[kind=/^(let|var)$/]',
      message: MUTABLE_STATE,
    },
    {
      selector:
        "CallExpression[callee.property.name='close'][callee.object.property.name='context']",
      message: 'Never close the shared AudioContext.',
    },
  ],
};

/**
 * @param {keyof typeof bans} kind
 * @param {import('eslint').Linter.Config[]} [extra]
 * @returns {import('eslint').Linter.Config[]}
 */
export function config(kind, extra = []) {
  /** @type {import('eslint').Linter.Config[]} */
  const out = [
    {
      ignores: [
        '**/node_modules/**',
        '**/.next/**',
        '**/out/**',
        '**/dist/**',
        '**/playwright-report/**',
        '**/test-results/**',
        '**/*.generated.ts',
        '**/next-env.d.ts',
      ],
    },
    ...tseslint.configs.recommended,
    {
      // A leading underscore marks a deliberately unused binding.
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
    {
      files: ['src/**', 'test/**', 'e2e/**'],
      rules: { 'no-restricted-imports': ['error', bans[kind]] },
    },
  ];
  if (kind === 'toolkit')
    out.push({
      files: ['src/phaser/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [phaserTypesOnly('Load Phaser only with import() inside mount().')],
            patterns: bans.toolkit.patterns.slice(0, 1),
          },
        ],
      },
    });
  if (kind === 'game') out.push({ files: ['src/**'], rules: gameSandbox });
  return [...out, ...extra];
}
