import { assert } from './error'
import { EmitterInterface, SyncOTEmitter } from './events'

/**
 * The type of tasks run by `TaskRunner`s.
 */
export type Task<Result> = () => Result | Promise<Result>

/**
 * The events emitted by `TaskRunner` instances.
 */
export interface TaskRunnerEvents<Result> {
    done: (result: Result) => void
    error: Error
}

/**
 * Manages running of a single task, including retries.
 */
export interface TaskRunner<Result>
    extends EmitterInterface<SyncOTEmitter<TaskRunnerEvents<Result>>> {
    /**
     * Runs the task now, unless it is already running or scheduled.
     * If it fails, emits an `error` event and schedules a retry.
     * If it succeeds, emits a `done` event.
     */
    run(): void
    /**
     * Cancels the currently scheduled or running task.
     */
    cancel(): void
}

/**
 * The options expected by `createTaskRunner`.
 */
export interface CreateTaskRunnerOptions {
    /**
     * The min retry delay in milliseconds.
     * Default is 1000.
     */
    minDelay?: number
    /**
     * The max retry delay in milliseconds.
     * Default is 10000.
     */
    maxDelay?: number
    /**
     * If >= 1, then it defines how many times longer to wait before each subsequent retry.
     * If === 0, then the retry delay is random.
     * Default is 1.5.
     */
    delayFactor?: number
}

const emptyOptions: CreateTaskRunnerOptions = {}

/**
 * Creates a new `TaskRunner` which runs the specified `task`.
 * @param task The task to run.
 */
export function createTaskRunner<Result>(
    task: Task<Result>,
    {
        minDelay = 1000,
        maxDelay = 10000,
        delayFactor = 1.5,
    }: CreateTaskRunnerOptions = emptyOptions,
): TaskRunner<Result> {
    return new Runner(task, minDelay, maxDelay, delayFactor)
}

class Runner<Result>
    extends SyncOTEmitter<TaskRunnerEvents<Result>>
    implements TaskRunner<Result> {
    private timeout: NodeJS.Timeout | undefined = undefined
    private promise: Promise<Result> | undefined = undefined
    private attempt: number = 0

    public constructor(
        private readonly task: Task<Result>,
        private readonly minDelay: number,
        private readonly maxDelay: number,
        private readonly delayFactor: number,
    ) {
        super()
        assert(
            typeof this.task === 'function',
            'Argument "task" must be a function.',
        )
        assert(
            Number.isSafeInteger(this.minDelay) && this.minDelay >= 0,
            'Argument "minDelay" must be a safe integer >= 0.',
        )
        assert(
            Number.isSafeInteger(this.maxDelay) &&
                this.maxDelay >= this.minDelay,
            'Argument "maxDelay" must be a safe integer >= minDelay.',
        )
        assert(
            (Number.isFinite(this.delayFactor) && this.delayFactor >= 1) ||
                this.delayFactor === 0,
            'Argument "delayFactor" must be a finite number >= 1 or === 0.',
        )
    }

    public run(): void {
        this.assertNotDestroyed()
        if (this.timeout === undefined && this.promise === undefined) {
            this.runNow()
        }
    }

    public cancel(): void {
        if (this.timeout !== undefined) {
            clearTimeout(this.timeout)
            this.timeout = undefined
        }
        this.promise = undefined
        this.attempt = 0
    }

    public destroy(): void {
        if (this.destroyed) {
            return
        }
        this.cancel()
        super.destroy()
    }

    private async runTask(): Promise<Result> {
        return await this.task()
    }

    private runNow(): void {
        const promise = (this.promise = this.runTask())
        promise.then(
            (result) => {
                if (this.promise === promise) {
                    this.promise = undefined
                    this.attempt = 0
                    this.emitAsync('done', result)
                }
            },
            (error) => {
                if (this.promise === promise) {
                    this.promise = undefined
                    this.schedule()
                    this.emitAsync('error', error)
                }
            },
        )
    }

    private schedule(): void {
        const baseDelay =
            this.delayFactor === 0
                ? this.minDelay +
                  Math.random() * (this.maxDelay - this.minDelay + 1)
                : this.minDelay * Math.pow(this.delayFactor, this.attempt)
        const delay = Math.max(
            this.minDelay,
            Math.min(this.maxDelay, Math.floor(baseDelay)),
        )
        this.attempt++
        this.timeout = setTimeout(this.onTimeout, delay)
    }

    private onTimeout = (): void => {
        this.timeout = undefined
        this.runNow()
    }
}