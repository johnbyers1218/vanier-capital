// jest.config.js (ESM)
export default {
  // The test environment that will be used for testing, 'node' is for backend.
  testEnvironment: 'node',
  // Use babel-jest so CommonJS style test files (require/exports) continue working while source is ESM.
  transform: { '^.+\\.js$': 'babel-jest' },

  // Map asset imports to mock (if needed)
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "identity-obj-proxy"
  },

  // Automatically clear mock calls, instances, and results before every test.
  // This is essential for preventing tests from influencing each other.
  clearMocks: true,

  // A list of paths to directories that Jest should use to search for files.
  roots: ['<rootDir>'],

  // The glob patterns Jest uses to detect test files.
  // We'll look for .test.js or .spec.js files inside the 'tests' directory.
  testMatch: ['<rootDir>/tests/**/*.test.js', '<rootDir>/tests/**/*.spec.js'],

  // Enable test coverage reporting.
  collectCoverage: true,

  // Specify which files to include in the coverage report.
  // We want to cover all .js files in the project root, but exclude node_modules,
  // the tests folder itself, and configuration files.
  collectCoverageFrom: [
  // Focus coverage on utils and API routes only for deterministic tests
    'utils/**/*.js',
  'routes/api*.js',
    'middleware/**/*.js',
    'config/**/*.js',
    // Exclusions
    '!node_modules/**',
    '!tests/**',
    '!jest.config.js',
    '!coverage/**',
    '!public/**',
    '!utils/email.js',
    '!utils/adminUploads.js',
    '!utils/googleAuth.js',
    '!app.js', // Often excluded as it's an entry point
  ],

  // The directory where Jest should output its coverage files.
  coverageDirectory: 'coverage',

  // A list of reporter names that Jest uses when writing coverage reports.
  coverageReporters: ['text', 'lcov', 'clover'],

  // This option is needed to support ES Modules syntax (`import`/`export`).
  // Only keep the babel-jest transform for .js files
  // transform: { '^.+\.js$': 'babel-jest' },

  // Global setup for tests (ESM-compatible). Ensures env defaults.
  setupFiles: ['<rootDir>/tests/setupEnv.cjs'],
};
