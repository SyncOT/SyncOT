import { ClientStorage } from './clientStorage'

export const clientStorageTests = (
    createClientStorage: () => ClientStorage,
) => {
    describe('ClientStorage', () => {
        let clientStorage: ClientStorage

        beforeEach(() => {
            clientStorage = createClientStorage()
        })

        test('dummy', () => {
            expect(clientStorage).toBe(clientStorage)
        })
    })
}
