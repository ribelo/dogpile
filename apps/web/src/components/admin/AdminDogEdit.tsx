import { createResource, createSignal, Show, For } from "solid-js"

interface DogDetail {
  id: string
  name: string
  shelterId: string
  shelterName: string
  sourceUrl: string
  status: string
  breed: string | null
  size: string | null
  age: string | null
  sex: string | null
  description: string | null
  personalityTags: string[] | null
  healthStatus: string | null
  photos: {
    original: string[]
    professional: string[]
    nose: string[]
  }
  createdAt: string
  lastSeenAt: string | null
  fingerprint: string
}

interface Props {
  apiUrl: string
  adminKey: string
  dogId: string
}

async function fetchDog(apiUrl: string, adminKey: string, dogId: string): Promise<DogDetail> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}`, {
    headers: { Authorization: `Bearer ${adminKey}` }
  })
  if (!response.ok) throw new Error("Failed to fetch dog")
  return response.json()
}

async function updateDog(apiUrl: string, adminKey: string, dogId: string, data: any): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}`, {
    method: "PUT",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
  if (!response.ok) throw new Error("Failed to update dog")
}

async function updateStatus(apiUrl: string, adminKey: string, dogId: string, status: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}/status`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  })
  if (!response.ok) throw new Error("Failed to update status")
}

async function regenerate(apiUrl: string, adminKey: string, dogId: string, target: string): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}/regenerate`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ target })
  })
  if (!response.ok) throw new Error("Failed to regenerate")
}

export default function AdminDogEdit(props: Props) {
  const [dog, { refetch }] = createResource(() => fetchDog(props.apiUrl, props.adminKey, props.dogId))
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)

  // Form state
  const [name, setName] = createSignal("")
  const [breed, setBreed] = createSignal("")
  const [size, setSize] = createSignal("")
  const [age, setAge] = createSignal("")
  const [sex, setSex] = createSignal("")
  const [description, setDescription] = createSignal("")

  // Initialize form when dog loads
  const initForm = (d: DogDetail) => {
    setName(d.name)
    setBreed(d.breed ?? "")
    setSize(d.size ?? "")
    setAge(d.age ?? "")
    setSex(d.sex ?? "")
    setDescription(d.description ?? "")
  }

  // Watch for dog data and init form
  createResource(() => dog(), (d) => {
    if (d) initForm(d)
    return d
  })

  async function handleSave() {
    setSaving(true)
    setMessage(null)
    try {
      await updateDog(props.apiUrl, props.adminKey, props.dogId, {
        name: name(),
        breed: breed() || null,
        size: size() || null,
        age: age() || null,
        sex: sex() || null,
        rawDescription: description() || null
      })
      setMessage("Saved!")
      setTimeout(() => setMessage(null), 2000)
    } catch (e) {
      setMessage("Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    try {
      await updateStatus(props.apiUrl, props.adminKey, props.dogId, newStatus)
      refetch()
    } catch (e) {
      console.error("Status change failed:", e)
    }
  }

  async function handleRegenerate(target: string) {
    try {
      await regenerate(props.apiUrl, props.adminKey, props.dogId, target)
      setMessage(`${target} regeneration queued`)
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      setMessage("Regeneration failed")
    }
  }

  return (
    <div>
      <div class="mb-6">
        <a href="/admin/dogs" class="text-blue-600 hover:underline">Back to dogs</a>
      </div>

      <Show when={dog.loading}>
        <p class="text-gray-500">Loading...</p>
      </Show>

      <Show when={dog.error}>
        <p class="text-red-600">Error loading dog</p>
      </Show>

      <Show when={dog()}>
        {(d) => {
          // Initialize form on first render
          if (!name()) initForm(d())
          
          return (
            <>
              <div class="flex items-center justify-between mb-6">
                <h1 class="text-2xl font-bold">{d().name}</h1>
                <div class="flex gap-2">
                  <Show when={d().status === "pending"}>
                    <button
                      onClick={() => handleStatusChange("available")}
                      class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </Show>
                  <Show when={d().status === "available"}>
                    <button
                      onClick={() => handleStatusChange("removed")}
                      class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </Show>
                  <Show when={d().status === "removed"}>
                    <button
                      onClick={() => handleStatusChange("available")}
                      class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                    >
                      Restore
                    </button>
                  </Show>
                  <span class={`px-3 py-2 rounded text-sm ${
                    d().status === "available" ? "bg-green-100 text-green-700" :
                    d().status === "pending" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {d().status}
                  </span>
                </div>
              </div>

              {/* Photos Section */}
              <div class="bg-white rounded-lg shadow p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-lg font-semibold">Photos</h2>
                  <button
                    onClick={() => handleRegenerate("photos")}
                    class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  >
                    Regenerate Photos
                  </button>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <h3 class="text-sm font-medium text-gray-500 mb-2">Original</h3>
                    <div class="flex flex-wrap gap-2">
                      <For each={d().photos.original}>
                        {(url) => <img src={url} alt="Original" class="w-24 h-24 object-cover rounded" />}
                      </For>
                      <Show when={d().photos.original.length === 0}>
                        <p class="text-gray-400">No photos</p>
                      </Show>
                    </div>
                  </div>
                  <div>
                    <h3 class="text-sm font-medium text-gray-500 mb-2">Professional</h3>
                    <div class="flex flex-wrap gap-2">
                      <For each={d().photos.professional}>
                        {(url) => <img src={url} alt="Professional" class="w-24 h-24 object-cover rounded" />}
                      </For>
                      <Show when={d().photos.professional.length === 0}>
                        <p class="text-gray-400">Not generated</p>
                      </Show>
                    </div>
                  </div>
                  <div>
                    <h3 class="text-sm font-medium text-gray-500 mb-2">Nose</h3>
                    <div class="flex flex-wrap gap-2">
                      <For each={d().photos.nose}>
                        {(url) => <img src={url} alt="Nose" class="w-24 h-24 object-cover rounded" />}
                      </For>
                      <Show when={d().photos.nose.length === 0}>
                        <p class="text-gray-400">Not generated</p>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>

              {/* Edit Form */}
              <div class="bg-white rounded-lg shadow p-6 mb-6">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-lg font-semibold">Details</h2>
                  <div class="flex items-center gap-4">
                    <Show when={message()}>
                      <span class="text-green-600">{message()}</span>
                    </Show>
                    <button
                      onClick={handleSave}
                      disabled={saving()}
                      class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving() ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
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
                    <label class="block text-sm font-medium text-gray-700 mb-1">Sex</label>
                    <select
                      value={sex()}
                      onChange={(e) => setSex(e.target.value)}
                      class="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Unknown</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Breed</label>
                    <input
                      type="text"
                      value={breed()}
                      onInput={(e) => setBreed(e.target.value)}
                      class="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Size</label>
                    <select
                      value={size()}
                      onChange={(e) => setSize(e.target.value)}
                      class="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Unknown</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Age (months)</label>
                    <input
                      type="text"
                      value={age()}
                      onInput={(e) => setAge(e.target.value)}
                      class="w-full border border-gray-300 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                <div class="mt-4">
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-sm font-medium text-gray-700">Description</label>
                    <button
                      onClick={() => handleRegenerate("bio")}
                      class="text-sm text-blue-600 hover:underline"
                    >
                      Regenerate Bio
                    </button>
                  </div>
                  <textarea
                    value={description()}
                    onInput={(e) => setDescription(e.target.value)}
                    rows={4}
                    class="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Source Reference */}
              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold mb-4">Source</h2>
                <div class="text-sm text-gray-500 space-y-2">
                  <p><strong>Shelter:</strong> {d().shelterName}</p>
                  <p><strong>Created:</strong> {new Date(d().createdAt).toLocaleString()}</p>
                  <p><strong>Last seen:</strong> {d().lastSeenAt ? new Date(d().lastSeenAt!).toLocaleString() : "Never"}</p>
                  <p><strong>Fingerprint:</strong> <code class="bg-gray-100 px-1 rounded">{d().fingerprint}</code></p>
                  <p>
                    <a href={d().sourceUrl} target="_blank" class="text-blue-600 hover:underline">
                      View on shelter website →
                    </a>
                  </p>
                </div>
              </div>
            </>
          )
        }}
      </Show>
    </div>
  )
}
