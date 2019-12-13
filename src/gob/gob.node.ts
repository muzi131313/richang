import { GobRecorder } from "./recorder/recorder"
import { IGobHandler, GobKeyword } from "./handlers/GobHandler"
import { GobExecutor } from "./executor/executor"
import { GobFilters } from "./filters/filters"
import { GobHandlerProxy } from "./handlers/proxy/GobHandlerProxy"
import { IGobOperator, GobOperatorType } from "./executor/lib/operators"
import { normalizeKeyPath } from "../object/object"

export class GobCore {
    gate: any
    data: any
    warp: any
    recorder: GobRecorder
    handler: IGobHandler
    executor: GobExecutor
    filters: GobFilters
    isGob = true
    /** 暂停订阅 */
    pauseSubscribe = false

    constructor() {
        this.data = {}
        this.gate = {}

        this.recorder = new GobRecorder(this)
        this.executor = new GobExecutor(this)
        this.filters = new GobFilters(this)
        this.handler = GobHandlerProxy
    }

    /**
     * 订阅操作记录
     * @param func (operator: IGobOperator) => void
     * @param subscribeVisits 订阅
     */
    subscribe(func: (operator: IGobOperator) => void, subscribeVisits = false) {
        this.recorder.subscribe(func, subscribeVisits)
    }

    /**
     * 赋值
     */
    set(keyPath: string | string[], value: any, directSet = false) {
        keyPath = normalizeKeyPath(keyPath)
        let key = keyPath[keyPath.length - 1]
        return this.executor.exec(
            GobOperatorType.set,
            key,
            value,
            keyPath,
            undefined,
            directSet ? { $$$GobDirectSet: true } : undefined
        )
    }

    /**
     * 取值
     * @param keyPath
     */
    get(keyPath: string | string[]) {
        keyPath = normalizeKeyPath(keyPath)
        let key = keyPath[keyPath.length - 1]
        return this.executor.exec(GobOperatorType.get, key, undefined, keyPath)
    }

    /**
     * 重置
     * @param target
     */
    reset(target: any): any {
        this.gate = {}
        this.data = {}
        return this.handler.wrapData(target, this, [], this.data, this.gate)
    }
}

interface IGobData {
    $on: 123
}

export interface GobExtension {
    (gobCore: GobCore, target: any): void
}

/**
 * 把一个对象包装起来，提供改动监控和拦截等功能
 * @param target
 * @constructor
 */
export function GobFactory<T>(
    target: T,
    options?: { vue?: boolean },
    extensions?: GobExtension | GobExtension[]
): T & IGobData {
    // 创建一个 GobCore
    let gobCore = new GobCore()

    // 配置
    if (options) {
    }

    // 注册扩展
    if (extensions) {
        if (!Array.isArray(extensions)) extensions = [extensions]
        extensions.forEach(extension => {
            extension(gobCore, target)
        })
    }

    // 把要托管的数据通过 handler 包装
    gobCore.data = target
    let warpData = gobCore.handler.wrapData(target, gobCore, [], gobCore.data, gobCore.gate)
    gobCore.warp = warpData
    return warpData

    // 创建一个代理
    // let proxy: GobProxy = new Proxy(gobCore.data,
    //     giveHandler(gobCore.data, gobCore.gate, [], {
    //         coreData: gobCore.data,
    //         coreGate: gobCore.gate,
    //         gobCore,
    //         GOB_CORE_NAME
    //     })
    // )
}

/**
 * 从一个 Gob 包装后的对象上取得他的 GobCore
 * @param gobData
 */
GobFactory.getGobCore = function(gobData: any): GobCore {
    let re = gobData[GobKeyword.$GobCore]
    if (re && re.isGob) {
        return <GobCore>re
    } else {
        throw new Error("[Gob] GobFactory.getGobCore, data is not gobData.")
    }
}