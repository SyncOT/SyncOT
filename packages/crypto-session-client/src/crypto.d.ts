// TODO update the official node typings

declare module 'crypto' {
    interface KeyObject {
        asymmetricKeyType: 'rsa' | 'dsa' | 'ec' | undefined
        symmetricKeySize: number | undefined
        type: 'secret' | 'public' | 'private'
        export(): string | Buffer
        export(options: {
            type: 'pkcs1' | 'spki' | 'pkcs8' | 'sec1'
            format: 'der'
            cypher?: string
            passphrase?: string | Buffer
        }): Buffer
        export(options: {
            type: 'pkcs1' | 'spki' | 'pkcs8' | 'sec1'
            format: 'pem'
            cypher?: string
            passphrase?: string | Buffer
        }): string
    }

    function createPublicKey(key: string | Buffer): KeyObject
    function createPublicKey(key: {
        key: string | Buffer
        format: 'pem'
    }): KeyObject
    function createPublicKey(key: {
        key: Buffer
        format: 'der'
        type: 'pkcs1' | 'spki'
    }): KeyObject

    function generateKeyPairSync(
        type: KeyType,
        options?: {
            modulusLength?: number
            publicExponent?: number
            divisorLength?: number
            namedCurve?: string
        },
    ): {
        publicKey: KeyObject
        privateKey: KeyObject
    }
}
