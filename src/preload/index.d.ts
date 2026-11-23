import type { Api, Channel } from '../shared/types'

declare global {
  interface Window {
    api: {
      invoke<C extends Channel>(channel: C, ...args: Api[C][0]): Promise<Api[C][1]>
    }
  }
}

export {}
