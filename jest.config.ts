import nextJest from 'next/jest.js';
import type { Config } from 'jest';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  /*
   * The `~/` alias, spelled out.
   *
   * next/jest reads it from tsconfig for ordinary imports, but `jest.mock`
   * calls are hoisted and resolved before that applies, so a mocked path had
   * to be relative. Relative then resolved from a different base under CI's
   * runner than under the local one, and three suites that passed here failed
   * there with "Cannot find module '../config' from 'jest.setup.ts'".
   *
   * An absolute mapping removes the question of what the path is relative TO,
   * which is the actual bug.
   */
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/src/__tests__/*.test.ts'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
