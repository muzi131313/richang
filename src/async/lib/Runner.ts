import { EventHub } from "../../event/event"

export interface IRunnerTask {
    id: number
    timestamp: number
    promise: Promise<any>
    // state: RunnerTaskState
    error?: any
    isFailed?: boolean
    isOver?: boolean
}

interface IRunnerFunc {
    func: Function
    args?: any[]
    thisArgs?: any
}
type RunnerFuncSort = [Function, ...any[]]

/**
 * 异步任务运行器选项
 * - timeout 超时时间
 */
interface IRunnerOptions {
    // 超时时间
    timeout?: number
}

enum RunnerEvent {
    taskStart = "taskStart",
    taskFinal = "taskFinal",
    progress = "progress"
}

/**
 * 异步任务运行器
 */
export class Runner {
    // 正在运行的任务
    running: IRunnerTask[] = []

    // 已结束的任务
    finally: IRunnerTask[] = []

    // 成功的任务
    success: IRunnerTask[] = []

    // 失败的任务
    failed: IRunnerTask[] = []

    // 同时运行任务数
    track!: number

    // 任务总数
    taskLength = 0

    // 被暂停
    isPause: boolean = false

    // 被正在运行
    isRunning: boolean = true

    // 结束后待分拣的任务
    private standby: IRunnerTask[] = []

    // 任务池
    taskPool: IRunnerFunc[] = []

    // 任务 id 索引
    private idIndex: number = 0

    //
    private eventHub!: EventHub

    // 任务整体控制函数
    private runResolve!: Function | void
    private runReject!: Function | void

    // 选项
    options: IRunnerOptions = {}

    /**
     * 运行多个异步函数（或非异步），可以控制同时运行任务的数量、超时时间、暂停、监听进度等操作
     *
     * @example
     * let runner = new Runner([ [sleep, 50], [sleep, 70] , [sleep, 200]], 2, { timeout: 500 })
     * runner.onProgress((precent, info, runner)=>{ console.log( precent +"%")})
     * await runner.run()
     *
     * @param taskFuncs 任务函数
     * @param track 同时运行任务数
     * @param options 选项
     * @param options.timeout 超时时间（单个任务）
     */
    constructor(
        taskFuncs?: Function[] | IRunnerFunc[] | RunnerFuncSort[],
        track: number = 3,
        options?: {
            // 超时时间
            timeout?: number
        }
    ) {
        if (taskFuncs) this.add(taskFuncs)
        this.track = track
        Object.assign(this.options, options)
    }

    /**
     * 监听每一个任务开始的事件
     * 会返回一个监听关闭函数，执行它会结束这个监听。
     * @param callback
     * @returns {() => void}
     */
    onTaskStart(callback: (task: IRunnerTask, runner: Runner) => void) {
        this.initEvent()
        return this.eventHub.on(RunnerEvent.taskStart, (info: { task: IRunnerTask; runner: Runner }) => {
            callback(info.task, info.runner)
        })
    }

    /**
     * 监听每一个任务结束的事件，成功与失败都会执行
     * 会返回一个监听关闭函数，执行它会结束这个监听。
     * @param callback
     * @returns {() => void}
     */
    onTaskFinal(callback: (task: IRunnerTask, runner: Runner) => void) {
        this.initEvent()
        return this.eventHub.on(RunnerEvent.taskFinal, (info: { task: IRunnerTask; runner: Runner }) => {
            callback(info.task, info.runner)
        })
    }

    /**
     * 监听任务进度
     * @example
     * runner.onProgress((precent: number, info: { current: number; max: number }, runner: Runner)=>{
     *    precent      // 99 （当前进度百分比）
     *    info.current // 990（当前任务数）
     *    info.max     // 1000（最大任务数）
     * })
     *
     * @param callback
     * @return {() => void}
     */
    onProgress(callback: (precent: number, info: { current: number; max: number }, runner: Runner) => void) {
        this.initEvent()
        return this.eventHub.on(RunnerEvent.progress, (info: { task: IRunnerTask; runner: Runner }) => {
            let current = info.runner.finally.length
            let max = info.runner.taskLength
            let precent = Math.round((current / max) * 100)
            callback(precent, { current, max }, info.runner)
        })
    }

    /**
     * 初始化事件，只有当需要使用事件功能时才初始化
     */
    private initEvent() {
        if (this.eventHub === undefined) {
            this.eventHub = new EventHub()
        }
    }

    /**
     * 运行任务池中的任务
     * @return {Promise<any>}
     */
    run() {
        return new Promise((resolve, reject) => {
            while (this.taskPool.length > 0 && this.running.length < this.track) {
                this.runOnce(<IRunnerFunc>this.taskPool.shift())
            }
            this.runResolve = resolve
            this.runReject = reject
        })
    }

    /**
     * 暂停
     */
    pause() {
        this.isPause = true
        this.isRunning = false
    }

    /**
     * 继续
     */
    resume() {
        this.isPause = false
        this.isRunning = true
        this.updateRunning()
    }

    /**
     * 添加任务到任务池
     * @param taskFunc
     */
    add(taskFunc: Function | Function[] | IRunnerFunc | IRunnerFunc[] | RunnerFuncSort | RunnerFuncSort[]) {
        if (Array.isArray(taskFunc)) {
            ;(<any[]>taskFunc).forEach(x => {
                this.taskPool.push(once(<Function | IRunnerFunc>x))
                this.taskLength++
            })
        } else {
            this.taskPool.push(once(<Function | IRunnerFunc>taskFunc))
            this.taskLength++
        }

        function once(func: Function | IRunnerFunc | RunnerFuncSort): IRunnerFunc {
            if (typeof func === "function") {
                return { func: <Function>func, args: undefined }
            } else if ((<any>func).func) {
                return <IRunnerFunc>func
            } else if (Array.isArray(func) && typeof func[0] === "function") {
                return { func: func[0], args: func.slice(1) }
            } else {
                throw Error("[Runner] add invalid <Function> or <IRunnerFunc> as task. typeof:" + typeof func)
            }
        }
    }

    /**
     * 清空全部任务与状态
     */
    clear() {
        this.taskPool = []
        this.running = []
        this.success = []
        this.failed = []
        this.finally = []
        this.standby = []
        this.taskLength = 0
        this.runReject = undefined
        this.runReject = undefined
        this.isPause = false
    }

    /**
     * 运行一个任务
     * @param task
     */
    private runOnce(runnerFunc: IRunnerFunc) {
        let id = this.idIndex++
        let timestamp = new Date().getTime()
        let runnerTask: IRunnerTask
        this.isRunning = true
        let promise = new Promise(async (resolve, reject) => {
            // 超时记录
            let isTimeout = false
            if (this.options.timeout && this.options.timeout > 0) {
                setTimeout(() => {
                    if (!runnerTask.isOver) {
                        isTimeout = true
                        runnerTask.isFailed = true
                        runnerTask.error = new Error("[Runner] timeout.")
                        runnerTask.isOver = true
                        this.standby.push(runnerTask)
                        this.updateRunning()
                        resolve()
                    }
                }, this.options.timeout)
            }

            try {
                if (this.eventHub) {
                    this.eventHub.emit(RunnerEvent.taskStart, { task: runnerTask, runner: this })
                }

                await runnerFunc.func.apply(runnerFunc.thisArgs, runnerFunc.args)
                if (isTimeout) return
                runnerTask.isFailed = false
                this.standby.push(runnerTask)
            } catch (e) {
                if (isTimeout) return
                runnerTask.isFailed = true
                runnerTask.error = e
                this.standby.push(runnerTask)
            }

            runnerTask.isOver = true
            this.updateRunning()
            resolve()
        })

        runnerTask = { id, timestamp, promise }
        this.running.push(runnerTask)
        // console.log("[runOnce]",runnerFunc)
        return runnerTask
    }

    /**
     * 更新运行状态
     */
    private updateRunning() {
        // 暂停时，不更新
        if (this.isPause) return

        // 已结束任务分拣
        while (this.standby.length > 0) {
            let task = this.standby.shift()
            if (task) {
                let index = this.running.indexOf(task)
                if (index > -1) this.running.splice(index, 1)

                this.finally.push(task)
                if (task.isFailed) {
                    this.failed.push(task)
                } else {
                    this.success.push(task)
                }

                if (this.eventHub) {
                    this.eventHub.emit(RunnerEvent.taskFinal, { task, runner: this })
                    this.eventHub.emit(RunnerEvent.progress, { task, runner: this })
                }
            }
        }

        // 暂停检查（为了事件可能修改暂停 ）
        if (this.isPause) return

        // 如果任务池有任务，且跑道未满，把任务放入跑道
        while (this.taskPool.length > 0 && this.running.length < this.track) {
            let task = <IRunnerFunc>this.taskPool.shift()
            this.runOnce(task)
        }

        // 任务全部完成
        if (this.running.length === 0 && this.taskPool.length === 0 && this.standby.length === 0) {
            this.isRunning = false
            if (this.runResolve) this.runResolve()
        }
    }
}