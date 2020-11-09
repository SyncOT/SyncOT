import { createAuthService } from '@syncot/auth-service-anonymous'
import { createConnection } from '@syncot/connection'
import {
    createContentService,
    createContentStore,
    createPubSub,
} from '@syncot/content'
import { createPingService } from '@syncot/ping'
import { SocketStream } from '@syncot/stream-socket'
import WebSocket from 'ws'

const path = '/syncot/websocket'
const port = 10004
const server = new WebSocket.Server({ path, port })
const contentStore = createContentStore()
const pubSub = createPubSub()

server.on('connection', (socket) => {
    const stream = new SocketStream(socket)
    const connection = createConnection()

    connection.connect(stream)
    stream.once('close', () => {
        connection.destroy()
    })

    const authService = createAuthService({ connection })
    const ping = createPingService({ connection })
    const content = createContentService({
        connection,
        authService,
        contentStore,
        pubSub,
    })
})

console.info(`SyncOT server listening on http://localhost:${port}${path}`)
