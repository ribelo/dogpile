import type { ShelterAdapter } from "./adapter.js"

const adapters = new Map<string, ShelterAdapter>()

export const registerAdapter = (adapter: ShelterAdapter): void => {
  adapters.set(adapter.id, adapter)
}

export const getAdapter = (id: string): ShelterAdapter | undefined => {
  return adapters.get(id)
}

export const getAllAdapters = (): readonly ShelterAdapter[] => {
  return Array.from(adapters.values())
}
