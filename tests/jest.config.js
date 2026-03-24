/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.js'],
  // Collect coverage from the actual source files (outside tests/)
  collectCoverageFrom: [
    '../src/**/*.js',
    '../popup.js',
    '!../src/**/interceptor.js'
  ],
  coverageDirectory: './coverage',
};
