import { Richang as rc } from "../../src/index"
import { sleep } from "../../src/async/async"

describe("KeyValueCache", () => {
    test("非字符串 key 缓存", () => {
        let cache = new rc.cache.KeyValueCache()
        let k1 = () => {}
        let k2 = () => {}
        let ob = { ob: 123 }

        cache.set(ob, ob)
        cache.set(k1, "k1")
        cache.set(k2, "k2")

        expect(cache.get(k1)).toEqual("k1")
        expect(cache.get(k2)).toEqual("k2")
        expect(cache.get(ob)).toEqual(ob)
    })

    test("timeout 过期时间", async () => {
        let cache = new rc.cache.KeyValueCache({ timeout: 200 })
        let k1 = () => {}
        let k2 = () => {}
        let ob = { ob: 123 }

        cache.set(ob, ob)
        cache.set(k1, "k1")
        cache.set(k2, "k2")

        expect(cache.get(k1)).toEqual("k1")
        expect(cache.get(k2)).toEqual("k2")
        expect(cache.get(ob)).toEqual(ob)
        expect(cache.has(k1)).toBeTruthy()
        expect(cache.has(k2)).toBeTruthy()
        expect(cache.has(ob)).toBeTruthy()

        await sleep(250)
        expect(cache.get(k1)).toEqual(undefined)
        expect(cache.get(k2)).toEqual(undefined)
        expect(cache.get(ob)).toEqual(undefined)
        expect(cache.has(k1)).toBeFalsy()
        expect(cache.has(k2)).toBeFalsy()
        expect(cache.has(ob)).toBeFalsy()
    })

    test("timeout 过期不删除", async () => {
        let cache = new rc.cache.KeyValueCache({ timeout: 200, disablRemoveTimeoutCache: true })
        let ob = { ob: 123 }

        cache.set(ob, ob)
        expect(cache.get(ob)).toEqual(ob)

        await sleep(333)

        expect(cache.get(ob)).toEqual(undefined)
        expect(cache.has(ob)).toBeFalsy()

        expect(cache.get(ob, { timeout: 500 })).toEqual(ob)
        expect(cache.has(ob, { timeout: 500 })).toBeTruthy()

        expect(cache.get(ob, { timeout: 111 })).toEqual(undefined)
        expect(cache.has(ob, { timeout: 111 })).toBeFalsy()
    })
})
