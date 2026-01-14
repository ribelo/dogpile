import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js"
import Check from "lucide-solid/icons/check"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import TriangleAlert from "lucide-solid/icons/triangle-alert"
import Clock from "lucide-solid/icons/clock"
import ExternalLink from "lucide-solid/icons/external-link"
import History from "lucide-solid/icons/history"
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

interface Job {
  id: string
  shelterId: string
  shelterName: string
  startedAt: string | null
  finishedAt: string | null
  dogsAdded: number
  dogsUpdated: number
  dogsRemoved: number
  errors: string[]
  errorMessage: string | null
  status: "running" | "error" | "success"
}

interface JobsResponse {
  jobs: Job[]
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

async function fetchJobs(apiUrl: string, adminKey: string): Promise<JobsResponse> {
  const response = await fetch(`${apiUrl}/admin/jobs?limit=20`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch jobs")
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
  const [jobs, { refetch: refetchJobs }] = createResource(() => fetchJobs(props.apiUrl, props.adminKey))
  const [scraping, setScraping] = createSignal<Record<string, boolean>>({})

  const stalledAfterMs = 60 * 60 * 1000
  const pollEveryMs = 5000

  const syncState = (shelter: Shelter): "idle" | "syncing" | "stalled" => {
    if (!shelter.syncStartedAt || shelter.syncFinishedAt) return "idle"
    const startedAtMs = new Date(shelter.syncStartedAt).getTime()
    if (!Number.isFinite(startedAtMs)) return "idle"
    return Date.now() - startedAtMs > stalledAfterMs ? "stalled" : "syncing"
  }

  const isStalled = (shelter: Shelter) => syncState(shelter) === "stalled"
  const hasError = (shelter: Shelter) => !!shelter.lastError

  createEffect(() => {
    const statsData = stats()
    const jobsData = jobs()
    const shouldPoll = 
      (statsData?.shelters.some(s => syncState(s) !== "idle")) ||
      (jobsData?.jobs.some(j => j.status === "running"))

    if (!shouldPoll) return
    const interval = setInterval(() => {
      refetch()
      refetchJobs()
    }, pollEveryMs)
    onCleanup(() => clearInterval(interval))
  })

  async function handleScrape(shelterId: string) {
    setScraping(prev => ({ ...prev, [shelterId]: true }))
    try {
      await triggerScrape(props.apiUrl, props.adminKey, shelterId)
      refetch()
      refetchJobs()
    } catch (e) {
      console.error("Scrape failed:", e)
    } finally {
      setScraping(prev => ({ ...prev, [shelterId]: false }))
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div class="flex gap-2">
          <button 
            onClick={() => { refetch(); refetchJobs() }}
            class="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
            title="Refresh"
          >
            <History size={20} class={(stats.loading || jobs.loading) ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <Show when={stats.loading && !stats()}>
        <p class="text-gray-500">Loading...</p>
      </Show>

      <Show when={stats.error}>
        <p class="text-red-600">Error loading stats. Check API connection.</p>
      </Show>

      <Show when={stats()} keyed>
        {(data) => (
          <>
            {/* KPI Cards */}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <KPICard 
                label="Pending" 
                value={data.dogs.pending} 
                href="/admin/dogs?status=pending" 
                color="text-yellow-600"
                icon={<Clock class="text-yellow-500/20" size={48} />}
              />
              <KPICard 
                label="Available" 
                value={data.dogs.available} 
                href="/admin/dogs?status=available" 
                color="text-green-600"
                icon={<Check class="text-green-500/20" size={48} />}
              />
              <KPICard 
                label="Removed" 
                value={data.dogs.removed} 
                href="/admin/dogs?status=removed" 
                color="text-gray-600"
                icon={<TriangleAlert class="text-gray-500/20" size={48} />}
              />
              <KPICard 
                label="Total" 
                value={data.dogs.total} 
                href="/admin/dogs?status=all" 
                color="text-blue-600"
                icon={<History class="text-blue-500/20" size={48} />}
              />
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
              {/* Needs Attention */}
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-xl font-bold flex items-center gap-2">
                    <TriangleAlert class="text-red-500" size={20} />
                    Needs Attention
                  </h2>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y overflow-hidden">
                  <Show 
                    when={data.shelters.some(s => isStalled(s) || hasError(s))}
                    fallback={<div class="p-8 text-center text-gray-500">Everything looks good!</div>}
                  >
                    <For each={data.shelters.filter(s => isStalled(s) || hasError(s))}>
                      {(shelter) => (
                        <div class="p-4 flex items-center justify-between hover:bg-gray-50">
                          <div>
                            <div class="font-medium">{shelter.name}</div>
                            <div class="text-sm text-red-600 flex items-center gap-1">
                              <Show when={isStalled(shelter)} fallback={shelter.lastError}>
                                Sync stalled (started {formatRelativeTime(shelter.syncStartedAt)})
                              </Show>
                            </div>
                          </div>
                          <button
                            onClick={() => handleScrape(shelter.id)}
                            disabled={scraping()[shelter.id] || syncState(shelter) === "syncing"}
                            class="text-xs bg-red-50 text-red-700 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
                          >
                            {scraping()[shelter.id] ? "Working..." : isStalled(shelter) ? "Retry Sync" : "Force Sync"}
                          </button>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
                <a href="/admin/shelters" class="text-sm text-blue-600 hover:underline font-medium inline-block">View all shelters →</a>
              </div>

              {/* Activity / Jobs */}
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <h2 class="text-xl font-bold flex items-center gap-2">
                    <ActivityIcon class="text-blue-500" size={20} />
                    Recent Activity
                  </h2>
                  <a href="/admin/queue" class="text-sm text-blue-600 hover:underline font-medium">View Queue →</a>
                </div>
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 divide-y overflow-hidden">
                  <Show when={jobs()} keyed>
                    {(jobsData) => (
                      <For each={jobsData.jobs.slice(0, 8)}>
                        {(job) => (
                          <div class="p-4 flex items-center justify-between hover:bg-gray-50">
                            <div class="min-w-0">
                              <div class="font-medium truncate">{job.shelterName}</div>
                              <div class="text-xs text-gray-500 flex items-center gap-1">
                                {formatRelativeTime(job.finishedAt ?? job.startedAt)}
                                <span class="text-gray-300">•</span>
                                <span class={
                                  job.status === "running" ? "text-blue-600" :
                                  job.status === "error" ? "text-red-600" : "text-green-600"
                                }>
                                  {job.status === "running" ? "Running" :
                                   job.status === "error" ? "Failed" : 
                                   `Success (+${job.dogsAdded} ~${job.dogsUpdated} -${job.dogsRemoved})`}
                                </span>
                              </div>
                            </div>
                            <Show when={job.status === "running"}>
                              <LoaderCircle size={16} class="animate-spin text-blue-600" />
                            </Show>
                          </div>
                        )}
                      </For>
                    )}
                  </Show>
                </div>
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

function KPICard(props: { label: string; value: number; href: string; color: string; icon: any }) {
  return (
    <a href={props.href} class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all relative overflow-hidden group">
      <div class="absolute right-[-8px] bottom-[-8px] opacity-10 group-hover:scale-110 transition-transform duration-300">
        {props.icon}
      </div>
      <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">{props.label}</h3>
      <div class={`text-4xl font-black ${props.color}`}>{props.value}</div>
      <div class="mt-4 flex items-center text-[10px] text-gray-400 font-bold uppercase tracking-tight">
        Click to view details <ExternalLink size={10} class="ml-1" />
      </div>
    </a>
  )
}

function ActivityIcon(props: { size?: number; class?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 24} height={props.size ?? 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={props.class}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  )
}
