import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import Check from "lucide-solid/icons/check"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import TriangleAlert from "lucide-solid/icons/triangle-alert"
import CostStats from "./CostStats"

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
  syncStartedAt: string | null
  syncFinishedAt: string | null
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

  const stalledAfterMs = 60 * 60 * 1000
  const pollEveryMs = 5000

  const syncState = (shelter: Shelter): "idle" | "syncing" | "stalled" => {
    if (!shelter.syncStartedAt || shelter.syncFinishedAt) return "idle"
    const startedAtMs = new Date(shelter.syncStartedAt).getTime()
    if (!Number.isFinite(startedAtMs)) return "idle"
    return Date.now() - startedAtMs > stalledAfterMs ? "stalled" : "syncing"
  }

  createEffect(() => {
    const data = stats()
    if (!data) return
    const shouldPoll = data.shelters.some(s => syncState(s) !== "idle")
    if (!shouldPoll) return
    const interval = setInterval(() => refetch(), pollEveryMs)
    onCleanup(() => clearInterval(interval))
  })

  async function handleScrape(shelterId: string) {
    setScraping(shelterId)
    try {
      await triggerScrape(props.apiUrl, props.adminKey, shelterId)
      refetch()
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
              <a href="/admin/dogs?status=pending" class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow">
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
                         <td class="px-6 py-4 text-gray-500">
                            <Show
                              when={syncState(shelter) !== "idle"}
                              fallback={formatRelativeTime(shelter.syncFinishedAt ?? shelter.lastSync)}
                            >
                              Started {formatRelativeTime(shelter.syncStartedAt)}
                            </Show>
                          </td>
                         <td class="px-6 py-4">
                          <Show
                            when={syncState(shelter) === "syncing"}
                            fallback={
                              <Show
                                when={syncState(shelter) === "stalled"}
                                fallback={
                                  <Show
                                    when={shelter.lastError}
                                    fallback={<span class="text-green-600 flex items-center gap-1"><Check size={14} /> Finished</span>}
                                  >
                                    <span class="text-red-600 flex items-center gap-1" title={shelter.lastError ?? ""}><TriangleAlert size={14} /> Finished (Error)</span>
                                  </Show>
                                }
                              >
                                <span class="text-orange-600 flex items-center gap-1" title={shelter.syncStartedAt ?? ""}><TriangleAlert size={14} /> Stalled</span>
                              </Show>
                            }
                          >
                            <span class="text-blue-600 flex items-center gap-1" title={shelter.syncStartedAt ?? ""}>
                              <LoaderCircle size={14} class="animate-spin" /> Syncing
                            </span>
                          </Show>
                          </td>
                          <td class="px-6 py-4">
                            <button
                              onClick={() => handleScrape(shelter.id)}
                              disabled={scraping() === shelter.id || syncState(shelter) !== "idle"}
                              class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {scraping() === shelter.id ? "Scraping..." : syncState(shelter) === "idle" ? "Scrape Now" : "In Progress"}
                            </button>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Costs Section */}
            <CostStats apiUrl={props.apiUrl} adminKey={props.adminKey} />
          </>
        )}
      </Show>
    </div>
  )
}
