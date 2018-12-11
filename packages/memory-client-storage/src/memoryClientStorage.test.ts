import {
    ClientId,
    ClientStorage,
    DocumentId,
    DocumentOperation,
    ErrorCodes,
    TypeName,
} from '@syncot/core'
import { MemoryClientStorage } from './memoryClientStorage'

const documentId: DocumentId = 'document-id'
const documentId2: DocumentId = 'document-id-2'
const clientId: ClientId = 'client-od'
const typeName: TypeName = 'type-name'
let clientStorage: ClientStorage
const testInvalidOperation: DocumentOperation = {
    client: clientId,
    id: documentId,
    operation: {
        data: null,
        type: typeName,
    },
    sequence: 0,
    version: 1.5,
}
const testOperations: DocumentOperation[] = [
    {
        client: clientId,
        id: documentId,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 0,
        version: 0,
    },
    {
        client: clientId,
        id: documentId,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 1,
        version: 1,
    },
    {
        client: clientId,
        id: documentId,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 2,
        version: 2,
    },
    {
        client: clientId,
        id: documentId,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 3,
        version: 3,
    },
    {
        client: clientId,
        id: documentId,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 4,
        version: 4,
    },
]
const testOperations2: DocumentOperation[] = [
    {
        client: clientId,
        id: documentId2,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 0,
        version: 0,
    },
    {
        client: clientId,
        id: documentId2,
        operation: {
            data: null,
            type: typeName,
        },
        sequence: 1,
        version: 1,
    },
]

beforeEach(() => {
    clientStorage = new MemoryClientStorage()
})

describe('remote operations', () => {
    test('save some operations', async () => {
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1),
        )
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1))
    })
    test('save some more operations', async () => {
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1, 2),
        )
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(2),
        )
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1))
    })
    test('save some operations and skip duplicates', async () => {
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1, 3),
        )
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(2),
        )
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1))
    })
    test('save operations for 2 documents', async () => {
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1),
        )
        await clientStorage.saveRemoteOperations(
            documentId2,
            testOperations2.slice(1),
        )
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1))
        await expect(
            clientStorage.loadRemoteOperations(documentId2),
        ).resolves.toStrictEqual(testOperations2.slice(1))
    })
    test('fail to save an operation with version less then 1', async () => {
        expect.assertions(3)
        await clientStorage
            .saveRemoteOperations(documentId, testOperations.slice())
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe('Expected first version >= 1')
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual([])
    })
    test('fail to save an operation with version 1.5', async () => {
        expect.assertions(3)
        await clientStorage
            .saveRemoteOperations(documentId, [testInvalidOperation])
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe(
                    'Expected first version to be a safe integer',
                )
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual([])
    })
    test('fail to save version 2, if version 1 is missing', async () => {
        expect.assertions(3)
        await clientStorage
            .saveRemoteOperations(documentId, testOperations.slice(2))
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe('Expected first version == 1')
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual([])
    })
    test('fail to save version 3, if version 2 is missing', async () => {
        expect.assertions(3)
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1, 2),
        )
        await clientStorage
            .saveRemoteOperations(documentId, testOperations.slice(3))
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe('Expected first version <= 2')
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1, 2))
    })
    test('fail to save version 4, if version 3 is missing', async () => {
        expect.assertions(3)
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1, 2),
        )
        await clientStorage
            .saveRemoteOperations(documentId, [
                testOperations[2],
                testOperations[4],
            ])
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe('Expected next version == 3')
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1, 2))
    })
    test('fail on duplicate version in the input', async () => {
        expect.assertions(3)
        await clientStorage.saveRemoteOperations(
            documentId,
            testOperations.slice(1, 2),
        )
        await clientStorage
            .saveRemoteOperations(documentId, [
                testOperations[2],
                testOperations[2],
            ])
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe('Expected next version == 3')
            })
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual(testOperations.slice(1, 2))
    })
    test('load operations when none were saved', async () => {
        await expect(
            clientStorage.loadRemoteOperations(documentId),
        ).resolves.toStrictEqual([])
    })
    test('fail to load, if start version is less than 1', async () => {
        expect.assertions(2)
        await clientStorage.loadRemoteOperations(documentId, 0).catch(e => {
            expect(e.code).toBe(ErrorCodes.InvalidArgument)
            expect(e.message).toBe('Expected start version >= 1')
        })
    })
    test('fail to load, if start version is 1.5', async () => {
        expect.assertions(2)
        await clientStorage.loadRemoteOperations(documentId, 1.5).catch(e => {
            expect(e.code).toBe(ErrorCodes.InvalidArgument)
            expect(e.message).toBe(
                'Expected start version to be a safe integer',
            )
        })
    })
    test('fail to load, if end version is less than 1', async () => {
        expect.assertions(2)
        await clientStorage.loadRemoteOperations(documentId, 1, 0).catch(e => {
            expect(e.code).toBe(ErrorCodes.InvalidArgument)
            expect(e.message).toBe('Expected end version >= 1')
        })
    })
    test('fail to load, if end version is 1.5', async () => {
        expect.assertions(2)
        await clientStorage
            .loadRemoteOperations(documentId, 1, 1.5)
            .catch(e => {
                expect(e.code).toBe(ErrorCodes.InvalidArgument)
                expect(e.message).toBe(
                    'Expected end version to be a safe integer',
                )
            })
    })
})
