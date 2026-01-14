import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js"
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

async function cancelJob(apiUrl: string, adminKey: string, jobId: string, reason: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  })
  if (!response.ok) throw new Error("Failed to cancel job")
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

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleString()
}

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

async function copyText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const el = document.createElement("textarea")
  el.value = text
  el.setAttribute("readonly", "true")
  el.style.position = "fixed"
  el.style.top = "-9999px"
  document.body.appendChild(el)
  el.select()
  document.execCommand("copy")
  document.body.removeChild(el)
}

export default function AdminJobsQueue(props: Props) {
  const [jobs, { refetch }] = createResource(() => fetchJobs(props.apiUrl, props.adminKey))
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal<string | null>(null)
  const [canceling, setCanceling] = createSignal(false)
  const [viewJobs, setViewJobs] = createSignal<JobsResponse | undefined>(undefined)
  let lastViewKey = ""

  const pollEveryMs = 5000
  createEffect(() => {
    const data = viewJobs()
    if (!data) return
    if (selectedId()) return
    const shouldPoll = data.jobs.some((j) => j.status === "running")
    if (!shouldPoll) return
    const interval = setInterval(() => refetch(), pollEveryMs)
    onCleanup(() => clearInterval(interval))
  })

  createEffect(() => {
    if (!selectedId()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null)
    }
    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => window.removeEventListener("keydown", onKeyDown))
  })

  const computeJobKey = (job: Job): string =>
    [
      job.id,
      job.status,
      job.shelterId,
      job.shelterName,
      job.startedAt ?? "",
      job.finishedAt ?? "",
      String(job.dogsAdded),
      String(job.dogsUpdated),
      String(job.dogsRemoved),
      job.errorMessage ?? "",
      job.errors.join("\n"),
    ].join("|")

  const computeListKey = (list: Job[]): string => list.map((j) => `${j.id}:${computeJobKey(j)}`).join("||")

  createEffect(() => {
    const data = jobs()
    if (!data) return

    const nextKey = computeListKey(data.jobs)
    if (nextKey === lastViewKey) return

    const prev = viewJobs()
    const prevEntries = new Map<string, { job: Job; key: string }>(
      (prev?.jobs ?? []).map((j) => [j.id, { job: j, key: computeJobKey(j) }])
    )

    const nextJobs = data.jobs.map((j) => {
      const key = computeJobKey(j)
      const prevEntry = prevEntries.get(j.id)
      if (prevEntry && prevEntry.key === key) return prevEntry.job
      return j
    })

    setViewJobs({ jobs: nextJobs })
    lastViewKey = nextKey
  })

  const jobsMap = createMemo(() => new Map((viewJobs()?.jobs ?? []).map((j) => [j.id, j])))
  const selectedJob = createMemo(() => {
    const id = selectedId()
    if (!id) return null
    return jobsMap().get(id) ?? null
  })

  async function handleCopy(label: string, text: string) {
    try {
      await copyText(text)
      setCopied(label)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      // ignore
    }
  }

  async function handleCancel(job: Job) {
    if (canceling()) return
    const ok = confirm(`Cancel job ${job.id}?\n\nThis will mark it finished with an error so you can retry.`)
    if (!ok) return

    setCanceling(true)
    try {
      await cancelJob(props.apiUrl, props.adminKey, job.id, "Canceled by admin")
      await refetch()
      setSelectedId(null)
    } catch (e) {
      console.error("Cancel failed:", e)
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">
          Scrape Jobs
          <Show when={viewJobs()}>
            <span class="text-gray-500 text-lg ml-2">({viewJobs()?.jobs.length ?? 0})</span>
          </Show>
        </h1>
        <div class="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={jobs.loading && !viewJobs()}
            class="text-sm bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <Show when={jobs.loading && !viewJobs()}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={jobs.error && !viewJobs()}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading jobs. Check API connection.</p>
        </div>
      </Show>

      <Show when={viewJobs() && viewJobs()!.jobs.length === 0}>
        <div class="bg-white rounded-lg shadow p-6 text-center">
          <p class="text-gray-500 text-lg">No scrape jobs recorded</p>
        </div>
      </Show>

      <Show when={viewJobs() && viewJobs()!.jobs.length > 0}>
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
              <For each={viewJobs()?.jobs}>
                {(job) => (
                  <tr
                    class="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedId(job.id)}
                    title="Click to view details"
                  >
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
                      <a
                        href={`/admin/dogs?shelter=${job.shelterId}`}
                        class="text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
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

      <Show when={selectedJob()}>
        {(job) => (
          <div class="fixed inset-0 z-50 flex items-center justify-center">
            <button
              class="absolute inset-0 bg-black/40"
              aria-label="Close"
              onClick={() => setSelectedId(null)}
            />

            <div
              role="dialog"
              aria-modal="true"
              class="relative z-10 w-full max-w-3xl mx-4 bg-white rounded-xl shadow-xl overflow-hidden"
            >
              <div class="flex items-start justify-between px-6 py-4 border-b border-gray-200">
                <div>
                  <div class="flex items-center gap-2">
                    <Show when={job().status === "running"}>
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
                        <LoaderCircle size={12} class="animate-spin" /> Running
                      </span>
                    </Show>
                    <Show when={job().status === "success"}>
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded">
                        <Check size={12} /> Success
                      </span>
                    </Show>
                    <Show when={job().status === "error"}>
                      <span class="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded">
                        <TriangleAlert size={12} /> Error
                      </span>
                    </Show>
                    <span class="text-sm text-gray-500">Job</span>
                    <span class="font-mono text-sm">{shortId(job().id)}</span>
                  </div>
                  <div class="mt-1 text-lg font-semibold">{job().shelterName}</div>
                  <div class="mt-1 text-sm text-gray-500">
                    Started {formatTimestamp(job().startedAt)} · Finished {formatTimestamp(job().finishedAt)} ·{" "}
                    {formatDuration(job().startedAt, job().finishedAt)}
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    class="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                    onClick={() => handleCopy("job-json", JSON.stringify(job(), null, 2))}
                  >
                    <Show when={copied() === "job-json"} fallback="Copy JSON">
                      Copied
                    </Show>
                  </button>
                  <button
                    class="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                    onClick={() => handleCopy("job-id", job().id)}
                  >
                    <Show when={copied() === "job-id"} fallback="Copy ID">
                      Copied
                    </Show>
                  </button>
                  <button
                    class="text-sm bg-gray-200 text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-300"
                    onClick={() => setSelectedId(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div class="p-6 space-y-6">
                <Show when={job().status === "running"}>
                  <div class="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div>
                      <div class="text-sm font-semibold text-orange-800">This job is still marked as running</div>
                      <div class="mt-1 text-sm text-orange-700">
                        If it is stale, cancel it to allow a clean retry.
                      </div>
                    </div>
                    <button
                      class="text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                      disabled={canceling()}
                      onClick={() => handleCancel(job())}
                    >
                      <Show when={canceling()} fallback="Cancel job">
                        Canceling...
                      </Show>
                    </button>
                  </div>
                </Show>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div class="bg-gray-50 rounded-lg p-4">
                    <div class="text-xs text-gray-500 uppercase font-medium">Added</div>
                    <div class="text-2xl font-bold text-gray-900">{job().dogsAdded}</div>
                  </div>
                  <div class="bg-gray-50 rounded-lg p-4">
                    <div class="text-xs text-gray-500 uppercase font-medium">Updated</div>
                    <div class="text-2xl font-bold text-gray-900">{job().dogsUpdated}</div>
                  </div>
                  <div class="bg-gray-50 rounded-lg p-4">
                    <div class="text-xs text-gray-500 uppercase font-medium">Removed</div>
                    <div class="text-2xl font-bold text-gray-900">{job().dogsRemoved}</div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <a
                    class="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                    href={`/admin/shelters/${job().shelterId}`}
                  >
                    Open shelter
                  </a>
                  <a
                    class="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                    href={`/admin/dogs?shelter=${job().shelterId}`}
                  >
                    Open dogs
                  </a>
                </div>

                <Show when={job().errorMessage}>
                  <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div class="text-sm font-semibold text-red-800">Error</div>
                    <div class="mt-1 text-sm text-red-700 font-mono whitespace-pre-wrap break-words">
                      {job().errorMessage}
                    </div>
                  </div>
                </Show>

                <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div class="text-sm font-semibold text-gray-900">
                      Errors <span class="text-gray-500">({job().errors.length})</span>
                    </div>
                    <Show when={job().errors.length > 0}>
                      <button
                        class="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                        onClick={() => handleCopy("errors", job().errors.join("\n"))}
                      >
                        <Show when={copied() === "errors"} fallback="Copy errors">
                          Copied
                        </Show>
                      </button>
                    </Show>
                  </div>
                  <div class="max-h-64 overflow-auto p-4">
                    <Show
                      when={job().errors.length > 0}
                      fallback={<div class="text-sm text-gray-500">No per-dog errors recorded.</div>}
                    >
                      <ol class="list-decimal pl-5 space-y-2">
                        <For each={job().errors}>
                          {(err) => (
                            <li class="text-sm font-mono text-gray-800 whitespace-pre-wrap break-words">{err}</li>
                          )}
                        </For>
                      </ol>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
