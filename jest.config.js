const { compilerOptions } = require('./tsconfig.json')

module.exports = {
    preset: 'ts-jest',
    setupTestFrameworkScriptFile: 'jest-extended',
    moduleNameMapper: {
        '^@syncot/([-\\w]+)$': '<rootDir>/packages/$1/src',
    },
    globals: {
        'ts-jest': {
            // jest uses the same tsConfig for all packages,
            // so we have to ensure that it finds all the required definitions.
            tsConfig: {
                ...compilerOptions,
                lib: ['dom'].concat(compilerOptions.lib),
            },
        },
    },
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/packages/[^/]+/lib/'],
    collectCoverage: true,
    collectCoverageFrom: [
        'packages/*/src/**/*.{ts,tsx,js,jsx}',
        '!packages/*/src/**/*.test.{ts,tsx,js,jsx}',
        '!packages/*/src/**/*Tests.{ts,tsx,js,jsx}',
        '!**/node_modules/**',
    ],
}
