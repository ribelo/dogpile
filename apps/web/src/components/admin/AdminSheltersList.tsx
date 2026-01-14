import { createResource, For, Show } from "solid-js"
import { createSignal } from "solid-js"

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

interface SheltersResponse {
  shelters: Shelter[]
}

interface Props {
  apiUrl: string
  adminKey: string
}

async function fetchShelters(apiUrl: string, adminKey: string): Promise<SheltersResponse> {
  const response = await fetch(`${apiUrl}/admin/shelters`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch shelters")
  return response.json()
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export default function AdminSheltersList(props: Props) {
  const [data, { refetch }] = createResource(() => fetchShelters(props.apiUrl, props.adminKey))
  const [pending, setPending] = createSignal<Record<string, boolean>>({})
  const [errors, setErrors] = createSignal<Record<string, string | null>>({})

  const handleScrape = async (id: string) => {
    setPending(prev => ({ ...prev, [id]: true }))
    setErrors(prev => ({ ...prev, [id]: null }))
    try {
      const response = await fetch(`${props.apiUrl}/admin/shelters/${id}/scrape`, {
        method: "POST",
        headers: { Authorization: `Bearer ${props.adminKey}` }
      })
      if (!response.ok) throw new Error("Scrape failed")
      await refetch()
    } catch (e) {
      setErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : "Scrape failed" }))
    } finally {
      setPending(prev => ({ ...prev, [id]: false }))
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Shelters</h1>
        <button
          onClick={() => refetch()}
          class="text-sm bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300"
        >
          Refresh
        </button>
      </div>

      <Show when={data.loading}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={data.error}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading shelters.</p>
        </div>
      </Show>

      <Show when={data() && data()!.shelters.length === 0}>
        <div class="bg-white rounded-lg shadow p-6 text-center">
          <p class="text-gray-500">No shelters found</p>
        </div>
      </Show>

      <Show when={data() && data()!.shelters.length > 0}>
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dogs</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={data()?.shelters}>
                {(shelter) => (
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <a href={`/admin/shelters/${shelter.id}`} class="text-blue-600 hover:underline font-medium">
                        {shelter.name}
                      </a>
                      <div class="text-xs text-gray-500">{shelter.slug}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-700">
                      {shelter.city}{shelter.region ? `, ${shelter.region}` : ""}
                    </td>
                    <td class="px-4 py-3">{shelter.dogCount}</td>
                    <td class="px-4 py-3 text-gray-500">{formatRelativeTime(shelter.lastSync)}</td>
                    <td class="px-4 py-3">
                      <span class={shelter.active ? "text-green-700" : "text-gray-600"}>
                        {shelter.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <a href={shelter.url} target="_blank" class="text-blue-600 hover:underline text-sm">
                        Open →
                      </a>
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-3">
                        <a href={`/admin/shelters/${shelter.id}`} class="text-sm text-blue-600 hover:underline">
                          Edit
                        </a>
                        <a href={`/admin/dogs?shelterId=${shelter.id}`} class="text-sm text-blue-600 hover:underline">
                          Dogs
                        </a>
                        <button
                          onClick={() => handleScrape(shelter.id)}
                          disabled={pending()[shelter.id]}
                          class="text-sm text-blue-600 hover:underline disabled:text-gray-400"
                        >
                          {pending()[shelter.id] ? "Scraping..." : "Scrape Now"}
                        </button>
                      </div>
                      <Show when={errors()[shelter.id]}>
                        <div class="text-[10px] text-red-600 mt-1">{errors()[shelter.id]}</div>
                      </Show>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  )
}
