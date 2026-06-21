import { dirname } from 'path'
import { fileURLToPath } from 'url'
import nextPlugin from 'eslint-config-next'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default [
  // Next.js core web vitals + TypeScript base config
  ...nextPlugin,
  // Override/add custom rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '*.config.js',
      '*.config.ts',
      'postcss.config.js',
      'tailwind.config.ts',
      'next.config.ts',
      'drizzle.config.ts',
      'vitest.config.ts',
    ],
  },
]
