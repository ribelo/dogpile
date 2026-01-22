import { createSignal, For } from "solid-js"
import { t } from "../i18n"
import type { DogFilters } from "./DogGrid"
import MobileFilterSheet from "./MobileFilterSheet"
import { CITIES } from "../constants/filters"

interface FilterBarProps {
  onFilter?: (filters: DogFilters) => void
}

export default function FilterBar(_props: FilterBarProps) {
  const [city, setCity] = createSignal("")
  const [size, setSize] = createSignal("")
  const [sex, setSex] = createSignal("")
  const [isMobileSheetOpen, setIsMobileSheetOpen] = createSignal(false)

  const handleSearch = (e: Event) => {
    e.preventDefault()
    const detail = {
      city: city() || undefined,
      size: size() || undefined,
      sex: sex() || undefined,
    }
    window.dispatchEvent(new CustomEvent('dog-filters-changed', { detail }))
  }

  return (
    <section id="filter-section" class="w-full pt-2 md:pt-3">
      <div class="max-w-6xl mx-auto px-4 mb-12 md:mb-24">
        <form onSubmit={handleSearch} class="hidden sm:grid grid-cols-4 gap-4">
          <div class="space-y-2">
            <label class="font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50">{t('filters.location')}</label>
            <div class="relative">
              <select
                id="filter-location-select"
                value={city()}
                onInput={(e) => setCity(e.currentTarget.value)}
                class="w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 px-4 py-3"
              >
                <option value="">{t('filters.anywhere')}</option>
                <For each={CITIES}>
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
                id="filter-size-select"
                value={size()}
                onInput={(e) => setSize(e.currentTarget.value)}
                class="w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 px-4 py-3"
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
            <label class="font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50">{t('filters.sex')}</label>
            <div class="relative">
              <select
                id="filter-sex-select"
                value={sex()}
                onInput={(e) => setSex(e.currentTarget.value)}
                class="w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 px-4 py-3"
              >
                <option value="">{t('filters.doesntMatter')}</option>
                <option value="male">{t('filters.male')}</option>
                <option value="female">{t('filters.female')}</option>
              </select>
              <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          <div class="flex items-end">
            <button id="filter-submit-button" type="submit" class="w-full btn-primary">
              {t('filters.startSniffing')}
            </button>
          </div>
        </form>
      </div>

      <MobileFilterSheet
        isOpen={isMobileSheetOpen()}
        onClose={() => setIsMobileSheetOpen(false)}
      />
    </section>
  )
}
