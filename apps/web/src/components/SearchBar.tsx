import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import type { Dog } from "./types"
import { capitalizeWords } from "../utils/format"
import { t } from "../i18n"

const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8787'

export default function SearchBar() {
  const [query, setQuery] = createSignal("")
  const [results, setResults] = createSignal<Dog[]>([])
  const [loading, setLoading] = createSignal(false)
  const [searched, setSearched] = createSignal(false)

  // Rotating placeholder
  const [placeholderIndex, setPlaceholderIndex] = createSignal(0)
  const [isFocused, setIsFocused] = createSignal(false)

  const examples = () => (t('search.examples') || []) as string[]

  const getPlaceholder = () => {
    const example = examples()[placeholderIndex()]
    return `${t('search.placeholder')} np. '${example}'`
  }

  // Rotate placeholder every 5 seconds if not focused and empty
  let intervalId: ReturnType<typeof setInterval>

  onMount(() => {
    intervalId = setInterval(() => {
      if (!isFocused() && !query()) {
        setPlaceholderIndex((i) => (i + 1) % examples().length)
      }
    }, 5000)
  })

  onCleanup(() => {
    clearInterval(intervalId)
  })

  // TODO: Support global filters (city, size, sex) in search queries
  const handleSearch = async (e: Event) => {
    e.preventDefault()
    if (!query().trim()) return
    
    setLoading(true)
    setSearched(true)
    
    try {
      const response = await fetch(`${API_URL}/dogs/search?q=${encodeURIComponent(query())}`)
      const data = await response.json()
      setResults(data.dogs || [])
    } catch (error) {
      console.error("Search failed:", error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="w-full max-w-2xl mx-auto mb-12">
      <form onSubmit={handleSearch} class="flex gap-2 mb-6">
        <input
          id="main-search-input"
          type="text"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={getPlaceholder()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          class="flex-1 px-4 py-3 border-2 border-sys-paper-shadow rounded-lg focus:border-sys-heart-core focus:outline-none"
        />
        <button
          id="main-search-submit-button"
          type="submit"
          disabled={loading()}
          class="px-6 py-3 bg-sys-ink-primary text-white font-bold rounded-lg hover:bg-sys-heart-core transition-colors disabled:opacity-50"
        >
          {loading() ? "..." : t('search.button')}
        </button>
      </form>
      
      <Show when={searched()}>
        <Show when={results().length > 0} fallback={
          <p class="text-center text-sys-ink-primary/60">Nie znaleziono psów</p>
        }>
          <div class="space-y-4">
            <For each={results()}>
              {(dog) => (
                <a href={`/dogs/${dog.id}`} class="block p-4 bg-sys-paper-card rounded-lg hover:shadow-md transition-shadow">
                  <div class="flex items-center gap-4">
                    <div class="flex-1">
                      <h3 class="font-bold text-lg">{capitalizeWords(dog.name)}</h3>
                      <p class="text-sm text-sys-ink-primary/60">
                        {dog.locationCity} • {dog.sizeEstimate?.value}
                      </p>
                    </div>
                  </div>
                </a>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}
