module.exports = {
    preset: 'ts-jest',
    setupTestFrameworkScriptFile: 'jest-extended',
    moduleNameMapper: {
        '^@syncot/([-\\w]+)$': '<rootDir>/packages/$1/src',
    },
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/packages/[^/]+/lib/'],
    collectCoverage: true,
    collectCoverageFrom: [
        'packages/*/src/**/*.{ts,tsx,js,jsx}',
        '!packages/*/src/**/*.test.{ts,tsx,js,jsx}',
        '!packages/*/src/**/*Tests.{ts,tsx,js,jsx}',
        '!**/node_modules/**',
    ],
}
