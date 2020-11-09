import { Buffer } from 'buffer'

window.Buffer = Buffer
window.process = {
    env: {},
    nextTick(fn, arg1, arg2, arg3) {
        switch (arguments.length) {
            case 0:
            case 1:
                window.queueMicrotask(fn)
                break
            case 2:
                window.queueMicrotask(() => fn.call(null, arg1))
                break
            case 3:
                window.queueMicrotask(() => fn.call(null, arg1, arg2))
                break
            case 4:
                window.queueMicrotask(() => fn.call(null, arg1, arg2, arg3))
                break
            default: {
                const args = Array.prototype.slice.call(arguments, 1)
                window.queueMicrotask(() => fn.apply(null, args))
                break
            }
        }
    },
}
