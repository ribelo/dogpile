import { createResource, createSignal, For, Show } from "solid-js"

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

async function fetchDogs(
  apiUrl: string, 
  adminKey: string,
  status: string,
  search: string,
  offset: number
): Promise<DogsResponse> {
  const params = new URLSearchParams({
    status,
    limit: "50",
    offset: offset.toString()
  })
  if (search) params.set("search", search)
  
  const response = await fetch(`${apiUrl}/admin/dogs?${params}`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch dogs")
  return response.json()
}

export default function AdminDogsList(props: Props) {
  const [status, setStatus] = createSignal("available")
  const [search, setSearch] = createSignal("")
  const [offset, setOffset] = createSignal(0)

  const [dogs, { refetch }] = createResource(
    () => ({ status: status(), search: search(), offset: offset() }),
    (params) => fetchDogs(props.apiUrl, props.adminKey, params.status, params.search, params.offset)
  )

  function handleSearch(e: Event) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const input = form.elements.namedItem("search") as HTMLInputElement
    setSearch(input.value)
    setOffset(0)
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">
          All Dogs
          <Show when={dogs()}>
            <span class="text-gray-500 text-lg ml-2">({dogs()?.total ?? 0})</span>
          </Show>
        </h1>
        <div class="flex gap-4">
          <select
            value={status()}
            onChange={(e) => { setStatus(e.target.value); setOffset(0) }}
            class="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="available">Published</option>
            <option value="removed">Removed</option>
            <option value="pending">Pending</option>
          </select>
          <form onSubmit={handleSearch} class="flex gap-2">
            <input
              type="text"
              name="search"
              placeholder="Search by name..."
              class="border border-gray-300 rounded-lg px-3 py-2 w-64"
            />
            <button type="submit" class="bg-gray-200 px-3 py-2 rounded-lg hover:bg-gray-300">
              Search
            </button>
          </form>
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
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shelter</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Breed</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <For each={dogs()?.dogs}>
                {(dog) => (
                  <tr class="hover:bg-gray-50">
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
                      <span class={`px-2 py-1 rounded text-xs ${
                        dog.status === "available" ? "bg-green-100 text-green-700" :
                        dog.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {dog.status}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <a
                        href={`/admin/dogs/${dog.id}`}
                        class="text-sm bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300"
                      >
                        Edit
                      </a>
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
            onClick={() => setOffset(Math.max(0, offset() - 50))}
            disabled={offset() === 0}
            class="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span class="text-gray-500">
            Showing {offset() + 1} - {Math.min(offset() + 50, dogs()?.total ?? 0)} of {dogs()?.total}
          </span>
          <button
            onClick={() => setOffset(offset() + 50)}
            disabled={offset() + 50 >= (dogs()?.total ?? 0)}
            class="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </Show>
    </div>
  )
}
