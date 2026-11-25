import { AsyncLocalStorage } from 'node:async_hooks'
import { Api } from 'grammy'
import type { BotFullInfo } from 'grammy/types'

export interface BotRuntime {
  id: string
  token: string
  info?: BotFullInfo
}

const runtimeStorage = new AsyncLocalStorage<BotRuntime>()

export function getBotRuntime(): BotRuntime {
  const runtime = runtimeStorage.getStore()
  if (!runtime) throw new Error('A configured Telegram bot context is required.')
  return runtime
}

// A request keeps its own bot, including while another bot handles an update.
export function withBotRuntime<T>(runtime: BotRuntime, operation: () => T): T {
  return runtimeStorage.run(runtime, operation)
}

type TelegramFetchInit = Omit<RequestInit, 'signal'> & {
  signal?: Pick<AbortSignal, 'aborted' | 'addEventListener'> | null
}

export const telegramClientOptions = {
  fetch: ((input: Parameters<typeof fetch>[0], init?: TelegramFetchInit) => {
    const { signal, ...options } = init ?? {}
    if (signal == null || signal instanceof AbortSignal) {
      return globalThis.fetch(input, { ...options, signal })
    }

    const controller = new AbortController()
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
    return globalThis.fetch(input, { ...options, signal: controller.signal })
  }) as unknown as NonNullable<ConstructorParameters<typeof Api>[1]>['fetch'],
}

export function getTelegramApi(token = getBotRuntime().token) {
  return new Api(token, telegramClientOptions)
}
