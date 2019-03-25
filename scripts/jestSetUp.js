if (typeof window !== 'undefined') {
    if (window.crypto) {
        throw new Error('window.crypto is already defined')
    }

    // `window.crypto` is not provided by jsdom, so we have to add it explicitly.
    const { Crypto } = require('@peculiar/webcrypto')
    window.crypto = new Crypto()
}

const toString = Object.prototype.toString

// Fixes the `instanceof` operator in jest.
// See https://github.com/facebook/jest/issues/2549#issuecomment-423202304.
Object.defineProperty(Error, Symbol.hasInstance, {
    value: value => toString.call(value) === '[object Error]',
})
