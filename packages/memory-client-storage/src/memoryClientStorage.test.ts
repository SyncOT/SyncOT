import {
    ClientId,
    clientStorageTests,
    createTypeManager,
    TypeManager,
} from '@syncot/core'
import { createClientStorage } from './memoryClientStorage'

const clientId: ClientId = 'client-id'
const typeManager: TypeManager = createTypeManager()

clientStorageTests(() => createClientStorage({ clientId, typeManager }))
