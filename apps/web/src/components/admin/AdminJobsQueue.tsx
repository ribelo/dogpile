import { createResource, For, Show } from "solid-js"
import Check from "lucide-solid/icons/check"
import LoaderCircle from "lucide-solid/icons/loader-circle"
import TriangleAlert from "lucide-solid/icons/triangle-alert"

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

async function fetchJobs(apiUrl: string, adminKey: string): Promise<JobsResponse> {
  const response = await fetch(`${apiUrl}/admin/jobs?limit=100`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch jobs")
  return response.json()
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—"
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

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—"
  if (!finishedAt) return "Running..."
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  const diffMs = end - start
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  return `${diffMins}m ${diffSecs % 60}s`
}

export default function AdminJobsQueue(props: Props) {
  const [jobs, { refetch }] = createResource(() => fetchJobs(props.apiUrl, props.adminKey))

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">
          Scrape Jobs
          <Show when={jobs()}>
            <span class="text-gray-500 text-lg ml-2">({jobs()?.jobs.length ?? 0})</span>
          </Show>
        </h1>
        <button
          onClick={() => refetch()}
          class="text-sm bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
        >
          Refresh
        </button>
      </div>

      <Show when={jobs.loading}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={jobs.error}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading jobs. Check API connection.</p>
        </div>
      </Show>

      <Show when={jobs() && jobs()!.jobs.length === 0}>
        <div class="bg-white rounded-lg shadow p-6 text-center">
          <p class="text-gray-500 text-lg">No scrape jobs recorded</p>
        </div>
      </Show>

      <Show when={jobs() && jobs()!.jobs.length > 0}>
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelter</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Errors</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={jobs()?.jobs}>
                {(job) => (
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <Show when={job.status === "running"}>
                        <span class="text-blue-600 flex items-center gap-1">
                          <LoaderCircle size={14} class="animate-spin" /> Running
                        </span>
                      </Show>
                      <Show when={job.status === "success"}>
                        <span class="text-green-600 flex items-center gap-1">
                          <Check size={14} /> Success
                        </span>
                      </Show>
                      <Show when={job.status === "error"}>
                        <span class="text-red-600 flex items-center gap-1" title={job.errorMessage ?? ""}>
                          <TriangleAlert size={14} /> Error
                        </span>
                      </Show>
                    </td>
                    <td class="px-4 py-3">
                      <a href={`/admin/dogs?shelter=${job.shelterId}`} class="text-blue-600 hover:underline">
                        {job.shelterName}
                      </a>
                    </td>
                    <td class="px-4 py-3 text-gray-500">{formatRelativeTime(job.startedAt)}</td>
                    <td class="px-4 py-3 text-gray-500">{formatDuration(job.startedAt, job.finishedAt)}</td>
                    <td class="px-4 py-3 text-gray-500">{job.dogsAdded}</td>
                    <td class="px-4 py-3 text-gray-500">{job.dogsUpdated}</td>
                    <td class="px-4 py-3">
                      <Show when={job.errors.length > 0} fallback={<span class="text-gray-400">—</span>}>
                        <span class="text-red-600" title={job.errors.join("\n")}>
                          {job.errors.length}
                        </span>
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
