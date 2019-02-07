const fs = require('fs')

module.exports = {
    projects: [
        fs.readdirSync('./packages').map(name => {
            return {
                name,
                displayName: name,
                preset: 'ts-jest',
                setupFilesAfterEnv: ['jest-extended'],
                moduleNameMapper: {
                    '^@syncot/([-\\w]+)$': '<rootDir>/packages/$1/src',
                },
                globals: {
                    'ts-jest': {
                        tsConfig: require(`./packages/${name}/tsconfig.json`)
                            .compilerOptions,
                    },
                },
                testEnvironment: 'node',
                testMatch: [`<rootDir>/packages/${name}/src/**/*.test.ts`],
                collectCoverage: true,
                collectCoverageFrom: [
                    'packages/*/src/**/*.{ts,tsx,js,jsx}',
                    '!packages/*/src/**/*.test.{ts,tsx,js,jsx}',
                    '!packages/*/src/**/*Tests.{ts,tsx,js,jsx}',
                    '!**/node_modules/**',
                ],
            }
        }),
    ],
}
