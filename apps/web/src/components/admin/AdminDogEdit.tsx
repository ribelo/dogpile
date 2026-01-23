import { createResource, createSignal, Show, For, onCleanup } from "solid-js"
import { getPhotoUrl } from "../../utils/photo-url"
import { capitalizeWords } from "../../utils/format"

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

const BREED_VALUES = [
  "owczarek_niemiecki", "owczarek_belgijski", "owczarek_podhalanski", "owczarek_szetlandzki",
  "labrador", "golden_retriever", "husky", "malamut", "bernardyn", "nowofundland",
  "dog_niemiecki", "rottweiler", "doberman", "bokser", "amstaf", "pitbull", "cane_corso", "akita",
  "border_collie", "beagle", "cocker_spaniel", "springer_spaniel", "seter", "pointer",
  "buldog", "basenji", "shiba", "chow_chow", "shar_pei", "dalmatynczyk",
  "jamnik", "jack_russell", "fox_terrier", "west_highland_terrier", "yorkshire_terrier",
  "maltanczyk", "shih_tzu", "pekinczyk", "mops", "buldog_francuski", "chihuahua",
  "pomeranian", "cavalier", "bichon", "pudel", "miniatura_schnauzer",
  "gonczy_polski", "ogar_polski", "chart_polski",
  "kundelek", "mieszaniec", "nieznana",
] as const

function getDisplayUrl(photoKey: string, size: "sm" | "lg" = "sm"): string {
  return getPhotoUrl(photoKey, size)
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

type RegenerateResponse = {
  message?: string
  traceId?: string
  expected?: string[]
}

async function regenerate(apiUrl: string, adminKey: string, dogId: string, target: string): Promise<RegenerateResponse> {
  const response = await fetch(`${apiUrl}/admin/dogs/${dogId}/regenerate`, {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ target })
  })
  if (!response.ok) throw new Error("Failed to regenerate")
  try {
    return await response.json()
  } catch {
    return {}
  }
}

interface ViewingPhoto {
  url: string
  category: keyof DogDetail['photos']
  index: number
}

export default function AdminDogEdit(props: Props) {
  const [dog, { refetch }] = createResource(() => fetchDog(props.apiUrl, props.adminKey, props.dogId))
  const [saving, setSaving] = createSignal(false)
  const [message, setMessage] = createSignal<string | null>(null)
  const [viewingPhoto, setViewingPhoto] = createSignal<ViewingPhoto | null>(null)
  const [regenerating, setRegenerating] = createSignal(false)
  const [expectedKeys, setExpectedKeys] = createSignal<string[]>([])

  let pollIntervalId: number | undefined
  let pollTimeoutId: number | undefined

  const stopPolling = () => {
    if (pollIntervalId !== undefined) {
      clearInterval(pollIntervalId)
      pollIntervalId = undefined
    }
    if (pollTimeoutId !== undefined) {
      clearTimeout(pollTimeoutId)
      pollTimeoutId = undefined
    }
  }

  onCleanup(() => stopPolling())

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

  // Keyboard navigation for modal
  const handleKeyDown = (e: KeyboardEvent) => {
    const current = viewingPhoto()
    if (!current) return
    
    if (e.key === "Escape") setViewingPhoto(null)
    if (e.key === "ArrowLeft") handlePrevPhoto()
    if (e.key === "ArrowRight") handleNextPhoto()
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", handleKeyDown)
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown))
  }

  function handlePrevPhoto() {
    const current = viewingPhoto()
    const d = dog()
    if (!current || !d) return
    
    const photos = d.photos[current.category]
    const prevIndex = (current.index - 1 + photos.length) % photos.length
    setViewingPhoto({ ...current, url: photos[prevIndex], index: prevIndex })
  }

  function handleNextPhoto() {
    const current = viewingPhoto()
    const d = dog()
    if (!current || !d) return
    
    const photos = d.photos[current.category]
    const nextIndex = (current.index + 1) % photos.length
    setViewingPhoto({ ...current, url: photos[nextIndex], index: nextIndex })
  }

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
      stopPolling()

      const response = await regenerate(props.apiUrl, props.adminKey, props.dogId, target)

      const shouldPoll = target === "photos" || target === "all"
      if (!shouldPoll) {
        setMessage(response.message || `${target} regeneration queued`)
        setTimeout(() => setMessage(null), 3000)
        return
      }

      const expected = response.expected ?? []
      if (expected.length === 0) {
        setMessage("Regeneration queued")
        setTimeout(() => setMessage(null), 3000)
        return
      }

      setRegenerating(true)
      setExpectedKeys(expected)
      setMessage("Processing...")

      const isComplete = (d: DogDetail): boolean => {
        const present = new Set([
          ...d.photos.professional,
          ...d.photos.nose,
        ])
        return expectedKeys().every((key) => present.has(key))
      }

      const pollOnce = async () => {
        await refetch()
        const d = dog()
        if (!d) return

        if (isComplete(d)) {
          stopPolling()
          setRegenerating(false)
          setMessage("Photos generated")
          setTimeout(() => setMessage(null), 3000)
        }
      }

      pollIntervalId = window.setInterval(() => {
        pollOnce().catch(() => {})
      }, 3000)

      pollTimeoutId = window.setTimeout(() => {
        stopPolling()
        setRegenerating(false)
        setMessage("Timed out, check logs")
      }, 2 * 60 * 1000)

      await pollOnce()
    } catch (e) {
      stopPolling()
      setRegenerating(false)
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
                <h1 class="text-2xl font-bold">{capitalizeWords(d().name)}</h1>
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
                    disabled={regenerating()}
                    class="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {regenerating() ? "Processing..." : "Regenerate Photos"}
                  </button>
                </div>
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <h3 class="text-sm font-medium text-gray-500 mb-2">Original</h3>
                    <div class="flex flex-wrap gap-2">
                      <For each={d().photos.original}>
                        {(url, i) => (
                          <img 
                            src={getDisplayUrl(url)} 
                            alt="Original" 
                            class="w-24 h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setViewingPhoto({ url, category: 'original', index: i() })}
                          />
                        )}
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
                        {(url, i) => (
                          <img 
                            src={getDisplayUrl(url)} 
                            alt="Professional" 
                            class="w-24 h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setViewingPhoto({ url, category: 'professional', index: i() })}
                          />
                        )}
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
                        {(url, i) => (
                          <img 
                            src={getDisplayUrl(url)} 
                            alt="Nose" 
                            class="w-24 h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setViewingPhoto({ url, category: 'nose', index: i() })}
                          />
                        )}
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
                    <select
                      value={breed()}
                      onChange={(e) => setBreed(e.target.value)}
                      class="w-full border border-gray-300 rounded-lg px-3 py-2"
                    >
                      <option value="">Unknown / Mix</option>
                      <For each={BREED_VALUES}>
                        {(b) => <option value={b}>{b.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>}
                      </For>
                    </select>
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

              {/* Photo Modal */}
              <Show when={viewingPhoto()}>
                {(photo) => (
                  <div 
                    class="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setViewingPhoto(null)}
                  >
                    <button 
                      class="absolute top-4 right-4 text-white text-4xl hover:text-gray-300"
                      onClick={() => setViewingPhoto(null)}
                    >
                      &times;
                    </button>
                    
                    <div class="relative max-w-7xl max-h-[90vh] flex items-center" onClick={(e) => e.stopPropagation()}>
                      <button 
                        class="absolute left-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 z-10"
                        onClick={handlePrevPhoto}
                      >
                        ←
                      </button>
                      
                      <img src={getDisplayUrl(photo().url, "lg")} alt="Full size" class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
                      
                      <button 
                        class="absolute right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 z-10"
                        onClick={handleNextPhoto}
                      >
                        →
                      </button>
                      
                      <div class="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black/50 py-1">
                      {photo().category} • {photo().index + 1} / {d().photos[photo().category].length}
                    </div>
                  </div>
                </div>
              )}
            </Show>
            </>
          )
        }}
      </Show>
    </div>
  )
}
