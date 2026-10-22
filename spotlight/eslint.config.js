// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const {
  TOKEN_GUARD_ALLOWLIST,
  TOKEN_GUARD_EXEMPT,
  TOKEN_GUARD_FILES,
  TOKEN_GUARD_SELECTORS,
} = require('./src/theme/token-guard-rules');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*']),
  expoConfig,
  {
    // Token guard: raw colors and numeric font sizes belong in src/theme.
    files: TOKEN_GUARD_FILES,
    ignores: [...TOKEN_GUARD_EXEMPT, ...TOKEN_GUARD_ALLOWLIST],
    rules: { 'no-restricted-syntax': ['error', ...TOKEN_GUARD_SELECTORS] },
  },
]);
