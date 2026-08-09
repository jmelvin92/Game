import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Architecture layers, ordered bottom to top.
 *
 * Dependencies point strictly downward: a layer may import from layers below it and
 * never from layers above. The rule that matters most is that no simulation layer may
 * import `render/` — that is what keeps the logic testable without a browser, lets the
 * renderer be replaced outright, and keeps the engine portable off the web.
 *
 * "Clean architecture" as an intention is worthless. This makes it a build failure.
 * See CLAUDE.md §5.
 */
const LAYERS = ['core', 'world', 'entity', 'nav', 'persist', 'render']

/** One ESLint config per layer, forbidding imports from every layer above it. */
const layerBoundaries = LAYERS.flatMap((layer, index) => {
  const forbidden = LAYERS.slice(index + 1)
  if (forbidden.length === 0) return []

  return [
    {
      files: [`src/${layer}/**/*.ts`],
      rules: {
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: forbidden.map((above) => ({
              // Covers both alias imports (`@/render/camera`) and any relative
              // path that climbs out into another layer (`../render/camera`).
              group: [`@/${above}`, `@/${above}/**`, `**/${above}/**`],
              message:
                `Architecture violation: src/${layer}/ must not import from src/${above}/. ` +
                `Dependencies point strictly downward (${LAYERS.join(' < ')}). ` +
                `Simulation produces state; rendering reads it, never the reverse. See CLAUDE.md §5.`,
            })),
          },
        ],
      },
    },
  ]
})

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The base rule must be off for the TypeScript-aware version to work; the
      // TS version also understands `import type`, which the base rule does not.
      'no-restricted-imports': 'off',

      // Unused variables are an error, but an underscore prefix marks a deliberate
      // discard (unused callback parameters, destructuring to omit a key).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  ...layerBoundaries,

  // Config files are not part of the TypeScript program.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
