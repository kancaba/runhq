/**
 * Commit message linter.
 *
 * Enforces Conventional Commits so release-please can cut versions and
 * generate a clean CHANGELOG. Keep the type list in sync with
 * .github/release-please-config.json → changelog-sections.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'docs',
        'build',
        'ci',
        'chore',
        'test',
        'style',
        'deps',
      ],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
