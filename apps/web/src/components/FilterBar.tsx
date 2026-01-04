import { createSignal, For } from "solid-js"
import { t } from "../i18n"
import type { DogFilters } from "./DogGrid"

// TODO: Fetch cities dynamically from API /dogs/cities endpoint
const cities = [
  "Warszawa",
  "Kraków",
  "Gdańsk",
  "Wrocław",
  "Legnica",
  "Jawor",
]

interface FilterBarProps {
  onFilter?: (filters: DogFilters) => void
}

export default function FilterBar(props: FilterBarProps) {
  const [city, setCity] = createSignal("")
  const [size, setSize] = createSignal("")
  const [sex, setSex] = createSignal("")

  const handleSearch = (e: Event) => {
    e.preventDefault()
    const filters = {
       city: city() || undefined,
       size: size() || undefined,
       sex: sex() || undefined,
     }
    if (props.onFilter) {
      props.onFilter(filters)
    } else {
      const event = new CustomEvent('dog-filters-changed', { detail: filters });
      window.dispatchEvent(event);
    }
  }

  return (
    <section class="max-w-6xl mx-auto px-4 mb-24 relative z-10">
      <div class="bg-sys-paper-card p-8 paper-edge shadow-sm border border-sys-paper-shadow">
        <div class="flex items-end gap-4 mb-6">
          <h2 class="font-title text-3xl font-bold text-sys-ink-primary">{t('filters.title')}</h2>
          <p class="text-sys-ink-primary/60 pb-1 italic font-bold">{t('filters.subtitle')}</p>
        </div>

        <form onSubmit={handleSearch} class="grid md:grid-cols-4 gap-4">
          <div class="space-y-2">
            <label class="font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50">{t('filters.location')}</label>
            <div class="relative">
              <select 
                value={city()}
                onInput={(e) => setCity(e.currentTarget.value)}
                class="w-full filter-input px-4 py-3 font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10"
              >
                <option value="">{t('filters.anywhere')}</option>
                <For each={cities}>
                  {(city) => <option value={city}>{city}</option>}
                </For>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50">{t('filters.size')}</label>
            <div class="relative">
              <select 
                value={size()}
                onInput={(e) => setSize(e.currentTarget.value)}
                class="w-full filter-input px-4 py-3 font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10"
              >
                <option value="">{t('filters.doesntMatter')}</option>
                <option value="small">{t('filters.pocketSized')}</option>
                <option value="medium">{t('filters.armful')}</option>
                <option value="large">{t('filters.bigBear')}</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50">{t('card.sex')}</label>
            <div class="relative">
              <select 
                value={sex()}
                onInput={(e) => setSex(e.currentTarget.value)}
                class="w-full filter-input px-4 py-3 font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10"
              >
                <option value="">{t('filters.doesntMatter')}</option>
                <option value="male">{t('card.male')}</option>
                <option value="female">{t('card.female')}</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div class="flex items-end">
            <button type="submit" class="w-full btn-primary">
              {t('filters.startSniffing')}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
