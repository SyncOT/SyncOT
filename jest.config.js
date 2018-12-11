module.exports = {
    preset: 'ts-jest',
    moduleNameMapper: {
        '^@syncot/([-\\w]+)$': '<rootDir>/packages/$1/src'
    },
    collectCoverage: true,
    collectCoverageFrom: [
        'packages/*/src/**/*.{ts,tsx,js,jsx}',
        '!packages/*/src/**/*.test.{ts,tsx,js,jsx}',
        '!**/node_modules/**'
    ]
}
