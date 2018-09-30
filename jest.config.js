const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig')

module.exports = {
    preset: 'ts-jest',
    moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: './packages' } ),
    collectCoverage: true,
    collectCoverageFrom: [
        "packages/*/src/**/*.{ts,tsx,js,jsx}",
        "!packages/*/src/**/*.test.{ts,tsx,js,jsx}",
        "!**/node_modules/**"
    ]
}
