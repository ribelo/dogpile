import type { ShelterAdapter } from "./adapter.js"
import { tozjaworAdapter } from "./adapters/tozjawor.js"
import { lpgkLegnicaAdapter } from "./adapters/lpgk-legnica.js"
import { schroniskoWroclawAdapter } from "./adapters/schronisko-wroclaw.js"
import { schroniskoWalbrzychAdapter } from "./adapters/schronisko-walbrzych.js"
import { schroniskoJeleniaGoraAdapter } from "./adapters/schronisko-jelenia-gora.js"
import { schroniskoDluzynaGornaAdapter } from "./adapters/schronisko-dluzyna-gorna.js"
import { schroniskoSwidnicaAdapter } from "./adapters/schronisko-swidnica.js"
import { fundacjaTaraAdapter } from "./adapters/fundacja-tara.js"
import { centaurusFolwarkAdapter } from "./adapters/centaurus-folwark.js"
import { zoodoptujLatkaNaLapceAdapter } from "./adapters/zoodoptuj-latka-na-lapce.js"
import { fundacjaKubusiaPuchatkaAdapter } from "./adapters/fundacja-kubusia-puchatka.js"

const adapters = new Map<string, ShelterAdapter>()

export const registerAdapter = (adapter: ShelterAdapter): void => {
  adapters.set(adapter.id, adapter)
}

registerAdapter(tozjaworAdapter)
registerAdapter(lpgkLegnicaAdapter)
registerAdapter(schroniskoWroclawAdapter)
registerAdapter(schroniskoWalbrzychAdapter)
registerAdapter(schroniskoJeleniaGoraAdapter)
registerAdapter(schroniskoDluzynaGornaAdapter)
registerAdapter(schroniskoSwidnicaAdapter)
registerAdapter(fundacjaTaraAdapter)
registerAdapter(centaurusFolwarkAdapter)
registerAdapter(zoodoptujLatkaNaLapceAdapter)
registerAdapter(fundacjaKubusiaPuchatkaAdapter)

export const getAdapter = (id: string): ShelterAdapter | undefined => {
  return adapters.get(id)
}

export const getAllAdapters = (): readonly ShelterAdapter[] => {
  return Array.from(adapters.values())
}

export const listAdapters = (): readonly { id: string; name: string }[] => {
  return Array.from(adapters.values()).map((a) => ({ id: a.id, name: a.name }))
}
