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
     * The default value is 100.
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
     * Executes the `task` synchronously, if `cycleDuration <= cycleTargetDuration`.
     * Otherwise schedules the `task` to execute when the event loop becomes idle.
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

    private _cycleTargetDuration: number = 100
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
        this.interval = setInterval(this.onInterval, this.cycleTargetDuration)
        /* istanbul ignore else */
        if (typeof this.interval.unref === 'function') {
            // Allow nodejs to exit regardless of this timer.
            this.interval.unref()
        }

        // Process the scheduled tasks once ASAP.
        if (!this.timeout) {
            this.timeout = setTimeout(this.onTimeout, 0)
            /* istanbul ignore else */
            if (typeof this.timeout.unref === 'function') {
                // Allow nodejs to exit regardless of this timer.
                this.timeout.unref()
            }
        }
    }

    private tasks: Task[] = []
    private interval: NodeJS.Timeout
    private timeout: NodeJS.Timeout | undefined = undefined

    public constructor() {
        this.interval = setInterval(this.onInterval, this.cycleTargetDuration)
        /* istanbul ignore else */
        if (typeof this.interval.unref === 'function') {
            // Allow nodejs to exit regardless of this timer.
            this.interval.unref()
        }
    }

    public execute(task: Task): boolean {
        if (this.cycleDuration <= this.cycleTargetDuration) {
            task()
            return true
        } else {
            this.tasks.push(task)
            return false
        }
    }

    private startCycle(): void {
        this.cycleStartTime = Date.now()
        const tasks = this.tasks
        this.tasks = []
        for (let i = 0, l = tasks.length; i < l; ++i) {
            this.execute(tasks[i])
        }
    }

    private onInterval = (): void => {
        this.startCycle()
    }

    private onTimeout = (): void => {
        this.timeout = undefined
        this.startCycle()
    }
}

const eventLoop = new Loop()
