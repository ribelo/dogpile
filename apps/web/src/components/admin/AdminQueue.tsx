import { createResource, createSignal, For, Show } from "solid-js"
import { Check, X } from "lucide-solid"

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
  status: string
  createdAt: string
}

interface DogsResponse {
  dogs: Dog[]
  total: number
}

interface Props {
  apiUrl: string
  adminKey: string
}

async function fetchPendingDogs(apiUrl: string, adminKey: string): Promise<DogsResponse> {
  const response = await fetch(`${apiUrl}/admin/dogs?status=pending&limit=100`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch dogs")
  return response.json()
}

async function approveDog(apiUrl: string, adminKey: string, dogId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}/status`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status: "available" })
  })
  if (!response.ok) throw new Error("Failed to approve dog")
}

async function bulkApprove(apiUrl: string, adminKey: string, dogIds: string[]): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/bulk-status`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ dogIds, status: "available" })
  })
  if (!response.ok) throw new Error("Failed to bulk approve")
}

async function deleteDog(apiUrl: string, adminKey: string, dogId: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to delete dog")
}

export default function AdminQueue(props: Props) {
  const [dogs, { refetch }] = createResource(() => fetchPendingDogs(props.apiUrl, props.adminKey))
  const [selected, setSelected] = createSignal<Set<string>>(new Set())
  const [loading, setLoading] = createSignal<string | null>(null)

  function toggleSelect(id: string) {
    const newSet = new Set(selected())
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelected(newSet)
  }

  function toggleSelectAll() {
    const allIds: string[] = dogs()?.dogs.map(d => d.id) ?? []
    if (selected().size === allIds.length) {
      setSelected(new Set<string>())
    } else {
      setSelected(new Set<string>(allIds))
    }
  }

  async function handleApprove(dogId: string) {
    setLoading(dogId)
    try {
      await approveDog(props.apiUrl, props.adminKey, dogId)
      refetch()
    } catch (e) {
      console.error("Approve failed:", e)
    } finally {
      setLoading(null)
    }
  }

  async function handleBulkApprove() {
    const ids = Array.from(selected())
    if (ids.length === 0) return
    setLoading("bulk")
    try {
      await bulkApprove(props.apiUrl, props.adminKey, ids)
      setSelected(new Set<string>())
      refetch()
    } catch (e) {
      console.error("Bulk approve failed:", e)
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete(dogId: string) {
    if (!confirm("Delete this dog permanently?")) return
    setLoading(dogId)
    try {
      await deleteDog(props.apiUrl, props.adminKey, dogId)
      refetch()
    } catch (e) {
      console.error("Delete failed:", e)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">
          Pending Dogs
          <Show when={dogs()}>
            <span class="text-gray-500 text-lg ml-2">({dogs()?.total ?? 0})</span>
          </Show>
        </h1>
        <button
          onClick={handleBulkApprove}
          disabled={selected().size === 0 || loading() === "bulk"}
          class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {loading() === "bulk" ? "Approving..." : `Approve Selected (${selected().size})`}
        </button>
      </div>

      <Show when={dogs.loading}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-gray-500">Loading...</p>
        </div>
      </Show>

      <Show when={dogs.error}>
        <div class="bg-white rounded-lg shadow p-6">
          <p class="text-red-600">Error loading dogs. Check API connection.</p>
        </div>
      </Show>

      <Show when={dogs() && dogs()!.dogs.length === 0}>
        <div class="bg-white rounded-lg shadow p-6 text-center">
          <p class="text-gray-500 text-lg">No dogs waiting for review</p>
        </div>
      </Show>

      <Show when={dogs() && dogs()!.dogs.length > 0}>
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selected().size === dogs()?.dogs.length && dogs()!.dogs.length > 0}
                    onChange={toggleSelectAll}
                    class="rounded"
                  />
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelter</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Breed</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={dogs()?.dogs}>
                {(dog) => (
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected().has(dog.id)}
                        onChange={() => toggleSelect(dog.id)}
                        class="rounded"
                      />
                    </td>
                    <td class="px-4 py-3">
                      <Show when={dog.thumbnailUrl} fallback={<div class="w-12 h-12 bg-gray-200 rounded" />}>
                        <img src={dog.thumbnailUrl!} alt={dog.name} class="w-12 h-12 object-cover rounded" />
                      </Show>
                    </td>
                    <td class="px-4 py-3 font-medium">
                      <a href={`/admin/dogs/${dog.id}`} class="text-blue-600 hover:underline">
                        {dog.name}
                      </a>
                    </td>
                    <td class="px-4 py-3 text-gray-500">{dog.shelterName}</td>
                    <td class="px-4 py-3 text-gray-500">{dog.breed ?? "-"}</td>
                    <td class="px-4 py-3 text-gray-500">{dog.size ?? "-"}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <button
                          onClick={() => handleApprove(dog.id)}
                          disabled={loading() === dog.id}
                          class="text-sm bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={14} />
                        </button>
                        <a
                          href={`/admin/dogs/${dog.id}`}
                          class="text-sm bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300"
                        >
                          Edit
                        </a>
                        <button
                          onClick={() => handleDelete(dog.id)}
                          disabled={loading() === dog.id}
                          class="text-sm bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
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
