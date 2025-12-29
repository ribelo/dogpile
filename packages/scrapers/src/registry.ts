import type { ShelterAdapter } from "./adapter.js"
import { tozjaworAdapter } from "./adapters/tozjawor.js"

const adapters = new Map<string, ShelterAdapter>()

export const registerAdapter = (adapter: ShelterAdapter): void => {
  adapters.set(adapter.id, adapter)
}

registerAdapter(tozjaworAdapter)

export const getAdapter = (id: string): ShelterAdapter | undefined => {
  return adapters.get(id)
}

export const getAllAdapters = (): readonly ShelterAdapter[] => {
  return Array.from(adapters.values())
}

export const listAdapters = (): readonly { id: string; name: string }[] => {
  return Array.from(adapters.values()).map((a) => ({ id: a.id, name: a.name }))
}
