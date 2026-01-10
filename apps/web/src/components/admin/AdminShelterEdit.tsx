import { createEffect, createResource, createSignal, For, Show } from "solid-js"

interface Shelter {
  id: string
  slug: string
  name: string
  url: string
  city: string
  region: string | null
  phone: string | null
  email: string | null
  lat: number | null
  lng: number | null
  status: "active" | "inactive" | "error"
  active: boolean
  lastSync: string | null
  dogCount: number
}

interface SyncLog {
  id: string
  shelterId: string
  startedAt: string
  finishedAt: string | null
  dogsAdded: number
  dogsUpdated: number
  dogsRemoved: number
  errors: string[]
}

interface ShelterResponse {
  shelter: Shelter
  syncLogs: SyncLog[]
}

interface Props {
  apiUrl: string
  adminKey: string
  shelterId: string
}

async function fetchShelter(apiUrl: string, adminKey: string, shelterId: string): Promise<ShelterResponse> {
  const response = await fetch(`${apiUrl}/admin/shelters/${shelterId}`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch shelter")
  return response.json()
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString()
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—"
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  const diffSec = Math.max(0, Math.floor((end - start) / 1000))
  if (diffSec < 60) return `${diffSec}s`
  const mins = Math.floor(diffSec / 60)
  const sec = diffSec % 60
  return `${mins}m ${sec}s`
}

export default function AdminShelterEdit(props: Props) {
  const [data, { refetch }] = createResource(
    () => props.shelterId,
    (id) => fetchShelter(props.apiUrl, props.adminKey, id)
  )

  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)

  const [name, setName] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [city, setCity] = createSignal("")
  const [region, setRegion] = createSignal("")
  const [phone, setPhone] = createSignal("")
  const [email, setEmail] = createSignal("")
  const [lat, setLat] = createSignal("")
  const [lng, setLng] = createSignal("")
  const [active, setActive] = createSignal(true)

  createEffect(() => {
    const shelter = data()?.shelter
    if (!shelter) return
    setName(shelter.name ?? "")
    setUrl(shelter.url ?? "")
    setCity(shelter.city ?? "")
    setRegion(shelter.region ?? "")
    setPhone(shelter.phone ?? "")
    setEmail(shelter.email ?? "")
    setLat(shelter.lat === null || shelter.lat === undefined ? "" : String(shelter.lat))
    setLng(shelter.lng === null || shelter.lng === undefined ? "" : String(shelter.lng))
    setActive(!!shelter.active)
  })

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      const latValue = lat().trim()
      const lngValue = lng().trim()
      const parsedLat = latValue ? Number(latValue) : null
      const parsedLng = lngValue ? Number(lngValue) : null

      if (latValue && (parsedLat === null || !Number.isFinite(parsedLat))) {
        setMessage("Invalid latitude")
        return
      }
      if (lngValue && (parsedLng === null || !Number.isFinite(parsedLng))) {
        setMessage("Invalid longitude")
        return
      }

      const body = {
        name: name().trim(),
        url: url().trim(),
        city: city().trim(),
        region: region().trim() ? region().trim() : null,
        phone: phone().trim() ? phone().trim() : null,
        email: email().trim() ? email().trim() : null,
        lat: parsedLat,
        lng: parsedLng,
        active: active(),
      }

      const response = await fetch(`${props.apiUrl}/admin/shelters/${props.shelterId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${props.adminKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      })
      if (!response.ok) throw new Error("Failed to update shelter")
      setMessage("Saved")
      await refetch()
    } catch (e) {
      console.error(e)
      alert("Failed to save")
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 2000)
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <div>
          <a href="/admin/shelters" class="text-blue-600 hover:underline text-sm">← Back to shelters</a>
          <h1 class="text-2xl font-bold mt-1">Edit Shelter</h1>
        </div>
        <div class="flex items-center gap-4">
          <Show when={message()}>
            <span class="text-green-600">{message()}</span>
          </Show>
          <button
            onClick={handleSave}
            disabled={saving() || data.loading}
            class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving() ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <Show when={data.loading}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={data.error}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading shelter.</p>
        </div>
      </Show>

      <Show when={data()}>
        {(d) => (
          <>
            <div class="bg-white rounded-lg shadow p-6 mb-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold">Details</h2>
                <a href={`/admin/dogs?shelterId=${d().shelter.id}`} class="text-sm text-blue-600 hover:underline">
                  View dogs →
                </a>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={name()}
                    onInput={(e) => setName(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input
                    type="text"
                    value={url()}
                    onInput={(e) => setUrl(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={city()}
                    onInput={(e) => setCity(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <input
                    type="text"
                    value={region()}
                    onInput={(e) => setRegion(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={phone()}
                    onInput={(e) => setPhone(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="text"
                    value={email()}
                    onInput={(e) => setEmail(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input
                    type="text"
                    value={lat()}
                    onInput={(e) => setLat(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input
                    type="text"
                    value={lng()}
                    onInput={(e) => setLng(e.target.value)}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div class="mt-4 flex items-center justify-between">
                <div class="text-sm text-gray-500">
                  <div><strong>ID:</strong> <code class="bg-gray-100 px-1 rounded">{d().shelter.id}</code></div>
                  <div><strong>Slug:</strong> <code class="bg-gray-100 px-1 rounded">{d().shelter.slug}</code></div>
                  <div><strong>Dogs:</strong> {d().shelter.dogCount}</div>
                  <div><strong>Last sync:</strong> {formatDateTime(d().shelter.lastSync)}</div>
                </div>
                <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={active()}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Active
                </label>
              </div>
            </div>

            <div class="bg-white rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-lg font-semibold">Sync History</h2>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Removed</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    <Show
                      when={d().syncLogs.length > 0}
                      fallback={
                        <tr>
                          <td class="px-6 py-4 text-gray-500" colSpan={6}>No sync logs</td>
                        </tr>
                      }
                    >
                      <For each={d().syncLogs}>
                        {(log) => (
                          <tr class="hover:bg-gray-50">
                            <td class="px-6 py-4 text-gray-700">{formatDateTime(log.startedAt)}</td>
                            <td class="px-6 py-4 text-gray-500">{formatDuration(log.startedAt, log.finishedAt)}</td>
                            <td class="px-6 py-4">{log.dogsAdded}</td>
                            <td class="px-6 py-4">{log.dogsUpdated}</td>
                            <td class="px-6 py-4">{log.dogsRemoved}</td>
                            <td class="px-6 py-4">
                              <Show
                                when={log.errors.length > 0}
                                fallback={<span class="text-green-700">OK</span>}
                              >
                                <span class="text-red-700" title={log.errors.join("\n")}>
                                  {log.errors.length} error{log.errors.length === 1 ? "" : "s"}
                                </span>
                              </Show>
                            </td>
                          </tr>
                        )}
                      </For>
                    </Show>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
