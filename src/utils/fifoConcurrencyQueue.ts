export type FifoConcurrencyRelease = () => void

export type FifoConcurrencyQueue = {
  acquire: () => Promise<FifoConcurrencyRelease>
}

/** 对齐旧 im medias-caption：限制同时下载数，避免多图并发压垮解密/下载链路。 */
export function createFifoConcurrencyQueue(concurrency = 3): FifoConcurrencyQueue {
  let active = 0
  const waiting: Array<() => void> = []

  return {
    acquire() {
      return new Promise((resolve) => {
        const grant = () => {
          active += 1
          resolve(() => {
            active -= 1
            const next = waiting.shift()
            if (next) next()
          })
        }
        if (active < concurrency) {
          grant()
        } else {
          waiting.push(grant)
        }
      })
    },
  }
}
