import { createResource, createSignal, For, Show, onCleanup } from "solid-js"
import Search from "lucide-solid/icons/search"
import { capitalizeWords } from "../../utils/format"

interface Dog {
  id: string
  name: string
  shelterId: string
  shelterName: string
  breed: string | null
  size: string | null
  age: string | null
  sex: string | null
  thumbnailUrl: string | null
  sourceUrl: string | null
  status: string
  createdAt: string
  lastSeenAt: string | null
}

interface DogsResponse {
  dogs: Dog[]
  total: number
}

interface Props {
  apiUrl: string
  adminKey: string
}

async function fetchDogs(
  apiUrl: string, 
  adminKey: string,
  status: string,
  search: string,
  offset: number,
  shelterId: string,
  sortBy: string,
  sortOrder: string
): Promise<DogsResponse> {
  const params = new URLSearchParams({
    status,
    limit: "50",
    offset: offset.toString(),
    sortBy,
    sortOrder
  })
  if (search) params.set("search", search)
  if (shelterId) params.set("shelterId", shelterId)
  
  const response = await fetch(`${apiUrl}/admin/dogs?${params}`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch dogs")
  return response.json()
}

export default function AdminDogsList(props: Props) {
  const initialParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams()

  const rawStatus = initialParams.get("status")
  const initialStatus = ["all", "pending", "available", "adopted", "reserved", "removed"].includes(rawStatus ?? "")
    ? (rawStatus as string)
    : "available"
  const initialSearch = initialParams.get("search") ?? ""
  const initialOffset = Math.max(parseInt(initialParams.get("offset") ?? "0") || 0, 0)
  const initialShelter = initialParams.get("shelter") ?? initialParams.get("shelterId") ?? ""
  const rawSortBy = initialParams.get("sortBy")
  const initialSortBy = ["createdAt", "updatedAt", "lastSeenAt", "name"].includes(rawSortBy ?? "")
    ? (rawSortBy as string)
    : "createdAt"
  const rawSortOrder = initialParams.get("sortOrder")
  const initialSortOrder = rawSortOrder === "asc" || rawSortOrder === "desc"
    ? rawSortOrder
    : "desc"

  const [status, setStatus] = createSignal(initialStatus)
  const [search, setSearch] = createSignal(initialSearch)
  const [offset, setOffset] = createSignal(initialOffset)
  const [shelterId, setShelterId] = createSignal(initialShelter)
  const [sortBy, setSortBy] = createSignal(initialSortBy)
  const [sortOrder, setSortOrder] = createSignal(initialSortOrder)
  const [updatingId, setUpdatingId] = createSignal<string | null>(null)
  const [dogToDelete, setDogToDelete] = createSignal<Dog | null>(null)
  const [isDeleting, setIsDeleting] = createSignal(false)

  const [dogs, { refetch, mutate }] = createResource(
    () => ({
      status: status(),
      search: search(),
      offset: offset(),
      shelterId: shelterId(),
      sortBy: sortBy(),
      sortOrder: sortOrder(),
    }),
    (params) =>
      fetchDogs(
        props.apiUrl,
        props.adminKey,
        params.status,
        params.search,
        params.offset,
        params.shelterId,
        params.sortBy,
        params.sortOrder
      )
  )

  let searchTimeout: ReturnType<typeof setTimeout>
  onCleanup(() => clearTimeout(searchTimeout))

  function syncUrl(next?: {
    status?: string
    search?: string
    offset?: number
    shelterId?: string
    sortBy?: string
    sortOrder?: string
  }) {
    if (typeof window === "undefined") return

    const url = new URL(window.location.href)
    const nextStatus = next?.status ?? status()
    const nextSearch = next?.search ?? search()
    const nextOffset = next?.offset ?? offset()
    const nextShelterId = next?.shelterId ?? shelterId()
    const nextSortBy = next?.sortBy ?? sortBy()
    const nextSortOrder = next?.sortOrder ?? sortOrder()

    url.searchParams.set("status", nextStatus)
    url.searchParams.set("sortBy", nextSortBy)
    url.searchParams.set("sortOrder", nextSortOrder)
    url.searchParams.set("offset", nextOffset.toString())

    if (nextSearch) url.searchParams.set("search", nextSearch)
    else url.searchParams.delete("search")

    if (nextShelterId) url.searchParams.set("shelter", nextShelterId)
    else url.searchParams.delete("shelter")

    url.searchParams.delete("shelterId")
    window.history.replaceState({}, "", url)
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

  function sortIndicator(column: string) {
    if (sortBy() !== column) return null
    return (
      <span class="ml-1 text-gray-400">
        {sortOrder() === "asc" ? "↑" : "↓"}
      </span>
    )
  }

  function toggleSort(column: string) {
    if (sortBy() === column) {
      const nextOrder = sortOrder() === "asc" ? "desc" : "asc"
      setSortOrder(nextOrder)
      setOffset(0)
      syncUrl({ sortOrder: nextOrder, offset: 0 })
      return
    }

    const defaultOrder = column === "name" ? "asc" : "desc"
    setSortBy(column)
    setSortOrder(defaultOrder)
    setOffset(0)
    syncUrl({ sortBy: column, sortOrder: defaultOrder, offset: 0 })
  }

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      setSearch(value)
      setOffset(0)
      syncUrl({ search: value, offset: 0 })
    }, 300)
  }

  async function updateStatus(id: string, newStatus: string) {
    setUpdatingId(id)
    
    const currentFilter = status()
    
    // Optimistic update - remove from list if status doesn't match filter
    mutate((prev) => {
      if (!prev) return prev
      if (currentFilter !== "all" && newStatus !== currentFilter) {
        // Dog no longer matches filter, remove it
        return {
          ...prev,
          total: prev.total - 1,
          dogs: prev.dogs.filter(d => d.id !== id)
        }
      }
      // Status matches filter, just update in place
      return {
        ...prev,
        dogs: prev.dogs.map(d => d.id === id ? { ...d, status: newStatus } : d)
      }
    })

    try {
      const response = await fetch(`${props.apiUrl}/admin/dogs/${id}/status`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${props.adminKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status: newStatus })
      })
      if (!response.ok) throw new Error("Failed to update status")
      // Success - UI already updated
    } catch (e) {
      // Rollback on failure - refetch to restore correct state
      await refetch()
      console.error(e)
      alert("Failed to update status")
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleDelete() {
    const dog = dogToDelete()
    if (!dog) return

    setIsDeleting(true)
    
    // Optimistic delete
    mutate((prev) => prev ? ({
      ...prev,
      total: prev.total - 1,
      dogs: prev.dogs.filter(d => d.id !== dog.id)
    }) : prev)

    try {
      const response = await fetch(`${props.apiUrl}/admin/dogs/${dog.id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${props.adminKey}`
        }
      })
      if (!response.ok) throw new Error("Failed to delete dog")
      setDogToDelete(null)
    } catch (e) {
      // Rollback - refetch to restore correct state
      await refetch()
      console.error(e)
      alert("Failed to delete dog")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <div class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold">
            All Dogs
            <Show when={dogs()}>
              <span class="text-gray-500 text-lg ml-2">({dogs()?.total ?? 0})</span>
            </Show>
          </h1>
        </div>

        <div class="flex flex-col md:flex-row md:items-center gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div class="relative flex-1">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={search()}
              onInput={handleSearchInput}
              placeholder="Search dogs by name..."
              class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-gray-50 focus:bg-white transition-colors"
            />
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm font-medium text-gray-600 whitespace-nowrap">Status:</label>
            <select
              value={status()}
              onChange={(e) => {
                const next = e.target.value
                setStatus(next)
                setOffset(0)
                syncUrl({ status: next, offset: 0 })
              }}
              class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">All</option>
              <option value="available">Published</option>
              <option value="removed">Removed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-sm font-medium text-gray-600 whitespace-nowrap">Shelter:</label>
            <input
              type="text"
              value={shelterId()}
              onChange={(e) => {
                const next = (e.target as HTMLInputElement).value.trim()
                setShelterId(next)
                setOffset(0)
                syncUrl({ shelterId: next, offset: 0 })
              }}
              placeholder="ID"
              class="border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-blue-500 focus:border-blue-500 text-sm w-48"
            />
          </div>
        </div>
      </div>

      <Show when={dogs.loading}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={dogs.error}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading dogs.</p>
        </div>
      </Show>

      <Show when={dogs() && dogs()!.dogs.length === 0}>
        <div class="bg-white rounded-lg shadow p-6 text-center">
          <p class="text-gray-500">No dogs found</p>
        </div>
      </Show>

      <Show when={dogs() && dogs()!.dogs.length > 0}>
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => toggleSort("name")}
                >
                  Name
                  {sortIndicator("name")}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelter</th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => toggleSort("createdAt")}
                >
                  Added
                  {sortIndicator("createdAt")}
                </th>
                <th
                  class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:bg-gray-100"
                  onClick={() => toggleSort("lastSeenAt")}
                >
                  Last Seen
                  {sortIndicator("lastSeenAt")}
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Breed</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={dogs()?.dogs}>
                {(dog) => (
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <Show when={dog.thumbnailUrl} fallback={<div class="w-12 h-12 bg-gray-200 rounded" />}>
                        <img src={dog.thumbnailUrl!} alt={capitalizeWords(dog.name)} class="w-12 h-12 object-cover rounded" />
                      </Show>
                    </td>
                    <td class="px-4 py-3 font-medium">
                      <a href={`/admin/dogs/${dog.id}`} class="text-blue-600 hover:underline">
                        {capitalizeWords(dog.name)}
                      </a>
                    </td>
                    <td class="px-4 py-3 text-gray-500">{dog.shelterName}</td>
                    <td class="px-4 py-3 text-gray-500">{formatRelativeTime(dog.createdAt)}</td>
                    <td class="px-4 py-3 text-gray-500">{formatRelativeTime(dog.lastSeenAt)}</td>
                    <td class="px-4 py-3 text-gray-500">{dog.breed ?? "-"}</td>
                    <td class="px-4 py-3 text-gray-500">{dog.size ?? "-"}</td>
                    <td class="px-4 py-3">
                      <div class="relative">
                        <select
                          value={dog.status}
                          disabled={updatingId() === dog.id}
                          onChange={(e) => updateStatus(dog.id, e.target.value)}
                          class={`appearance-none border rounded px-2 py-1 text-sm pr-8 ${
                            updatingId() === dog.id ? "opacity-50 cursor-wait" : "cursor-pointer"
                          } ${
                            dog.status === "available" ? "bg-green-50 border-green-200 text-green-800" :
                            dog.status === "pending" ? "bg-yellow-50 border-yellow-200 text-yellow-800" :
                            dog.status === "removed" ? "bg-red-50 border-red-200 text-red-800" :
                            dog.status === "adopted" ? "bg-blue-50 border-blue-200 text-blue-800" :
                            "bg-gray-50 border-gray-200 text-gray-800"
                          }`}
                        >
                          <option value="available">Available</option>
                          <option value="pending">Pending</option>
                          <option value="reserved">Reserved</option>
                          <option value="adopted">Adopted</option>
                          <option value="removed">Removed</option>
                        </select>
                        <Show when={updatingId() === dog.id}>
                          <div class="absolute right-2 top-1/2 -translate-y-1/2">
                            <div class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        </Show>
                      </div>
                    </td>
                    <td class="px-4 py-3">
                      <Show when={dog.sourceUrl}>
                        <a 
                          href={dog.sourceUrl!} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          class="text-blue-600 hover:text-blue-800"
                          title="View Source"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </Show>
                    </td>
                    <td class="px-4 py-3">
                      <a
                        href={`/admin/dogs/${dog.id}`}
                        class="text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300"
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => setDogToDelete(dog)}
                        class="text-sm bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 ml-2"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div class="mt-4 flex justify-between items-center">
          <button
            onClick={() => {
              const next = Math.max(0, offset() - 50)
              setOffset(next)
              syncUrl({ offset: next })
            }}
            disabled={offset() === 0}
            class="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span class="text-gray-500">
            Showing {offset() + 1} - {Math.min(offset() + 50, dogs()?.total ?? 0)} of {dogs()?.total}
          </span>
          <button
            onClick={() => {
              const next = offset() + 50
              setOffset(next)
              syncUrl({ offset: next })
            }}
            disabled={offset() + 50 >= (dogs()?.total ?? 0)}
            class="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>

        {/* Delete Confirmation Modal */}
        <Show when={dogToDelete()}>
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
              class="fixed inset-0 bg-black/50 transition-opacity"
              onClick={() => !isDeleting() && setDogToDelete(null)}
            ></div>
            <div class="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h3 class="text-lg font-bold text-gray-900 mb-2">
                Delete {capitalizeWords(dogToDelete()?.name || "this dog")}?
              </h3>
              <p class="text-gray-500 mb-6">
                Are you sure you want to delete this dog? This will permanently remove the dog and all associated photos.
              </p>
              <div class="flex justify-end gap-3">
                <button
                  onClick={() => setDogToDelete(null)}
                  disabled={isDeleting()}
                  class="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting()}
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Show when={isDeleting()} fallback="Delete">
                    <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting...
                  </Show>
                </button>
              </div>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
