if (typeof window !== 'undefined') {
    if (window.crypto) {
        throw new Error('window.crypto is already defined')
    }

    // `window.crypto` is not provided by jsdom, so we have to add it explicitly.
    const { Crypto } = require('@peculiar/webcrypto')
    window.crypto = new Crypto()
}
