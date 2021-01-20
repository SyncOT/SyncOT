const fs = require('fs')

module.exports = {
    projects: [
        fs.readdirSync('./packages').map((name) => {
            return {
                name,
                displayName: name,
                setupFiles: ['<rootDir>/scripts/jestSetUp'],
                setupFilesAfterEnv: ['jest-extended'],
                moduleFileExtensions: [
                    'ts',
                    'tsx',
                    'json',
                    'js',
                    'jsx',
                    'node',
                ],
                moduleNameMapper: {
                    '^@syncot/([-\\w]+)$': '<rootDir>/packages/$1/src',
                },
                transform: {
                    '\\.[jt]sx?$': 'babel-jest',
                },
                testEnvironment: 'node',
                testMatch: [`<rootDir>/packages/${name}/src/**/*.test.[jt]s`],
            }
        }),
    ],
    collectCoverage: true,
    collectCoverageFrom: [
        '<rootDir>/packages/*/src/**/*.ts',
        '!<rootDir>/packages/*/src/**/*.{d,mock,test}.ts',
        '!<rootDir>/packages/*/src/index.ts',
    ],
}
