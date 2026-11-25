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

export const telegramClientOptions = {
  fetch: ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)) as typeof fetch,
}

export function getTelegramApi(token = getBotRuntime().token) {
  return new Api(token, telegramClientOptions)
}
