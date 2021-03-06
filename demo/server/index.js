import { BaseSession, createAuthService } from '@syncot/auth'
import { createConnection } from '@syncot/connection'
import {
    createContentBackend,
    createContentService,
    createContentStore,
    createPubSub,
} from '@syncot/content'
import { createContentType as createProseMirrorContentType } from '@syncot/content-type-prosemirror'
import { createPing } from '@syncot/ping'
import { SocketStream } from '@syncot/stream-socket'
import WebSocket from 'ws'

const path = '/syncot/websocket'
const port = 10004
const server = new WebSocket.Server({ path, port })
const contentStore = createContentStore()
const pubSub = createPubSub()
const proseMirrorContentType = createProseMirrorContentType()
const contentBackend = createContentBackend({
    contentStore,
    pubSub,
    contentTypes: {
        demo: proseMirrorContentType,
    },
})
class DemoSession extends BaseSession {
    mayReadContent() {
        return true
    }
    mayWriteContent() {
        return true
    }
    mayReadPresence() {
        return true
    }
    mayWritePresence() {
        return true
    }
}

server.on('connection', (socket) => {
    const stream = new SocketStream(socket)
    const connection = createConnection()

    connection.connect(stream)
    stream.once('close', () => {
        connection.destroy()
    })

    const auth = createAuthService({
        connection,
        createSession() {
            return new DemoSession()
        },
    })
    const ping = createPing({ connection, timeout: 50000 })
    const contentService = createContentService({
        connection,
        auth,
        contentBackend,
    })
})

console.info(`SyncOT server listening on http://localhost:${port}${path}`)
