import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  eslintConfigPrettier,
  {
    rules: {
      // Non-null assertions are common in binary parsing where we check bounds ourselves
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Allow explicit any for DataView.getFloat16 feature detection
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars prefixed with _ are intentional
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'examples/**'],
  },
);
