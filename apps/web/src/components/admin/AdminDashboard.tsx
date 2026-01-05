import { createResource, createSignal, For, Show } from "solid-js"

interface DogStats {
  pending: number
  available: number
  removed: number
  total: number
}

interface Shelter {
  id: string
  name: string
  slug: string
  active: boolean
  dogCount: number
  lastSync: string | null
  lastError: string | null
}

interface StatsResponse {
  dogs: DogStats
  shelters: Shelter[]
}

interface Props {
  apiUrl: string
  adminKey: string
}

async function fetchStats(apiUrl: string, adminKey: string): Promise<StatsResponse> {
  const response = await fetch(`${apiUrl}/admin/stats`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch stats")
  return response.json()
}

async function triggerScrape(apiUrl: string, adminKey: string, shelterId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/shelters/${shelterId}/scrape`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to trigger scrape")
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

export default function AdminDashboard(props: Props) {
  const [stats, { refetch }] = createResource(() => fetchStats(props.apiUrl, props.adminKey))
  const [scraping, setScraping] = createSignal<string | null>(null)

  async function handleScrape(shelterId: string) {
    setScraping(shelterId)
    try {
      await triggerScrape(props.apiUrl, props.adminKey, shelterId)
      setTimeout(() => refetch(), 2000)
    } catch (e) {
      console.error("Scrape failed:", e)
    } finally {
      setScraping(null)
    }
  }

  return (
    <div>
      <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

      <Show when={stats.loading}>
        <p class="text-gray-500">Loading...</p>
      </Show>

      <Show when={stats.error}>
        <p class="text-red-600">Error loading stats. Check API connection.</p>
      </Show>

      <Show when={stats()}>
        {(data) => (
          <>
            {/* Stats Cards */}
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <a href="/admin/queue" class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
                <h2 class="text-sm font-medium text-gray-500 uppercase">Pending</h2>
                <p class="text-3xl font-bold text-yellow-600">{data().dogs.pending}</p>
              </a>
              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-sm font-medium text-gray-500 uppercase">Published</h2>
                <p class="text-3xl font-bold text-green-600">{data().dogs.available}</p>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-sm font-medium text-gray-500 uppercase">Removed</h2>
                <p class="text-3xl font-bold text-gray-600">{data().dogs.removed}</p>
              </div>
              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-sm font-medium text-gray-500 uppercase">Total</h2>
                <p class="text-3xl font-bold text-blue-600">{data().dogs.total}</p>
              </div>
            </div>

            {/* Shelters Table */}
            <div class="bg-white rounded-lg shadow">
              <div class="px-6 py-4 border-b border-gray-200">
                <h2 class="text-lg font-semibold">Shelters</h2>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50">
                    <tr>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dogs</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    <For each={data().shelters}>
                      {(shelter) => (
                        <tr class="hover:bg-gray-50">
                          <td class="px-6 py-4">
                            <a href={`/admin/dogs?shelter=${shelter.id}`} class="text-blue-600 hover:underline">
                              {shelter.name}
                            </a>
                          </td>
                          <td class="px-6 py-4">{shelter.dogCount}</td>
                          <td class="px-6 py-4 text-gray-500">{formatRelativeTime(shelter.lastSync)}</td>
                          <td class="px-6 py-4">
                            <Show 
                              when={shelter.lastError} 
                              fallback={<span class="text-green-600">✓ OK</span>}
                            >
                              <span class="text-red-600" title={shelter.lastError ?? ""}>⚠ Error</span>
                            </Show>
                          </td>
                          <td class="px-6 py-4">
                            <button
                              onClick={() => handleScrape(shelter.id)}
                              disabled={scraping() === shelter.id}
                              class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {scraping() === shelter.id ? "Scraping..." : "Scrape Now"}
                            </button>
                          </td>
                        </tr>
                      )}
                    </For>
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
