import type { Config } from 'jest';

const config: Config = {
  // Left off deliberately. With it on, a suite that collects nothing prints
  // "No tests found" and exits 0: every test in this repo lives in one spec
  // file, so a rename or a change to testMatch would turn `pnpm test` into a
  // green run of zero tests. The flag came in from upstream, where a workspace
  // package legitimately has no tests; here it only hides the one failure mode
  // that matters.
  passWithNoTests: false,
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  testEnvironment: 'node',
  // external/ holds the vendored engines (Shorts-Maker, Pixelle-Video). They
  // are standalone projects with their own test runners, module resolution and
  // Next.js transform, so running their suites under this config both fails
  // and loads enough of two extra apps to exhaust the default heap - which is
  // what made `npm test`, and therefore verify:snaps:preflight, die with an
  // out-of-memory error before it could reach its later checks.
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/tmp/', '/external/'],
  moduleNameMapper: {
    '^@gitroom/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@gitroom/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/react/(.*)$':
      '<rootDir>/libraries/react-shared-libraries/src/$1',
    '^@gitroom/plugins/(.*)$': '<rootDir>/libraries/plugins/src/$1',
    '^@gitroom/orchestrator/(.*)$': '<rootDir>/apps/orchestrator/src/$1',
    '^@gitroom/extension/(.*)$': '<rootDir>/apps/extension/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        diagnostics: false,
        // transpileModule instead of a full TS program. Without this ts-jest
        // builds a LanguageService over the whole monorepo before running a
        // line of test code: measured, a spec that imports nothing started at
        // 4,246 MB of heap and the suite needed --max-old-space-size=8192 to
        // finish. With it the same suite peaks at 344 MB and runs in 8s instead
        // of 39s.
        //
        // Nothing is given up. Type errors were already off via `diagnostics:
        // false` above, and the specs and verifier scripts are typechecked
        // separately by `npm run verify:snaps:spec-types`, which exists for
        // exactly that reason.
        isolatedModules: true,
        tsconfig: {
          module: 'commonjs',
          jsx: 'react-jsx',
        },
      },
    ],
  },
};

export default config;
