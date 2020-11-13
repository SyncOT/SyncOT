/**
 * The type of tasks that can be executed by `EventLoop`.
 */
export type Task = () => void

/**
 * Provides IO-friendly task scheduling.
 */
export interface EventLoop {
    /**
     * The target cycle duration in milliseconds.
     * The schduler will aim to process IO at least once per `cycleTargetDuration` milliseconds.
     * The default value is 50.
     * The min value is 10.
     */
    cycleTargetDuration: number
    /**
     * The duration of the current cycle in milliseconds.
     */
    readonly cycleDuration: number
    /**
     * The timestamp at which the current cycle started.
     */
    readonly cycleStartTime: number
    /**
     * `true`, if the event loop is free to execute another task, otherwise `false`.
     */
    readonly isFree: boolean

    /**
     * Executes the `task` synchronously, if the event loop is free.
     * Otherwise schedules the `task` to execute when the event loop becomes idle.
     * The tasks are guaranteed to execute in the order in which they were passed to `execute`.
     * @param task The task to execute.
     * @returns `true`, if the task has been executed synchronously, or `false`, if it has been scheduled for later.
     */
    execute(task: Task): boolean
}

export function globalEventLoop(): EventLoop {
    return eventLoop
}

class Loop implements EventLoop {
    public cycleStartTime: number = Date.now()

    public get cycleDuration(): number {
        return Date.now() - this.cycleStartTime
    }

    private _cycleTargetDuration: number = 50
    public get cycleTargetDuration(): number {
        return this._cycleTargetDuration
    }
    public set cycleTargetDuration(cycleTargetDuration: number) {
        // tslint:disable-next-line:no-bitwise
        if (cycleTargetDuration !== (cycleTargetDuration | 0)) {
            throw new TypeError('cycleTargetDuration must be a 32 bit integer.')
        }
        if (cycleTargetDuration < 10) {
            throw new RangeError('cycleTargetDuration must be >= 10.')
        }
        this._cycleTargetDuration = cycleTargetDuration

        // Process the scheduled tasks at the new interval.
        clearInterval(this.interval)
        this.interval = setInterval(this.startCycle, this.cycleTargetDuration)
        /* istanbul ignore else */
        if (typeof this.interval.unref === 'function') {
            // Allow nodejs to exit regardless of this timer.
            this.interval.unref()
        }

        // Process the scheduled tasks once ASAP.
        queueMicrotask(this.startCycle)
    }

    public get isFree(): boolean {
        return (
            this.tasks.length === 0 &&
            this.cycleDuration <= this.cycleTargetDuration
        )
    }

    private tasks: Task[] = []
    private interval: NodeJS.Timeout

    public constructor() {
        this.interval = setInterval(this.startCycle, this.cycleTargetDuration)
        /* istanbul ignore else */
        if (typeof this.interval.unref === 'function') {
            // Allow nodejs to exit regardless of this timer.
            this.interval.unref()
        }
    }

    public execute(task: Task): boolean {
        if (this.isFree) {
            task()
            return true
        } else {
            this.tasks.push(task)
            return false
        }
    }

    private startCycle = (): void => {
        this.cycleStartTime = Date.now()
        let i = 0
        while (
            i < this.tasks.length &&
            this.cycleDuration <= this.cycleTargetDuration
        ) {
            this.tasks[i++]()
        }
        this.tasks.splice(0, i)
    }
}

const eventLoop = new Loop()
