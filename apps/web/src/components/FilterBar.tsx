import { createSignal, For, createEffect, onCleanup } from "solid-js"
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
  const [isStuck, setIsStuck] = createSignal(false)

  createEffect(() => {
    const handleScroll = () => {
      setIsStuck(window.scrollY > 200)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    onCleanup(() => window.removeEventListener('scroll', handleScroll))
  })

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
    <section id="filter-section" class={`sticky top-0 z-40 transition-all duration-300 w-full ${isStuck() ? 'bg-sys-paper-base/95 backdrop-blur-sm shadow-lg py-4' : 'py-8 md:py-12'}`}>
      <div class={`max-w-6xl mx-auto px-4 transition-all duration-300 ${isStuck() ? '' : 'mb-12 md:mb-24'}`}>
        <div class={`bg-sys-paper-card paper-edge shadow-sm border border-sys-paper-shadow transition-all duration-300 ${isStuck() ? 'p-3 md:p-4' : 'p-6 md:p-8'}`}>
          <button 
            id="mobile-filter-open-button"
            onClick={() => setIsMobileSheetOpen(true)}
            class="sm:hidden w-full flex items-center justify-between px-4 py-3 bg-sys-paper-base border-2 border-sys-paper-shadow rounded-xl font-bold text-sys-ink-primary"
            type="button"
          >
            <span class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
              {t('filters.title')}
            </span>
            <span class="text-sys-heart-core text-sm">{city() || size() || sex() ? 'Active' : ''}</span>
          </button>
        </div>

        <form onSubmit={handleSearch} class={`hidden sm:grid grid-cols-4 transition-all duration-300 ${isStuck() ? 'gap-2' : 'gap-4'}`}>
          <div class={`space-y-2 ${isStuck() ? '' : 'space-y-2'}`}>
            <label class={`font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50 ${isStuck() ? 'hidden' : ''}`}>{t('filters.location')}</label>
            <div class="relative">
              <select 
                id="filter-location-select"
                value={city()}
                onInput={(e) => setCity(e.currentTarget.value)}
                class={`w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 transition-all duration-300 ${isStuck() ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
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

          <div class={`space-y-2 ${isStuck() ? '' : 'space-y-2'}`}>
            <label class={`font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50 ${isStuck() ? 'hidden' : ''}`}>{t('filters.size')}</label>
            <div class="relative">
              <select 
                id="filter-size-select"
                value={size()}
                onInput={(e) => setSize(e.currentTarget.value)}
                class={`w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 transition-all duration-300 ${isStuck() ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
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

          <div class={`space-y-2 ${isStuck() ? '' : 'space-y-2'}`}>
            <label class={`font-bold text-sm uppercase tracking-wide text-sys-ink-primary/50 ${isStuck() ? 'hidden' : ''}`}>{t('filters.sex')}</label>
            <div class="relative">
              <select 
                id="filter-sex-select"
                value={sex()}
                onInput={(e) => setSex(e.currentTarget.value)}
                class={`w-full filter-input font-bold text-sys-ink-primary focus:ring-2 focus:ring-sys-heart-core outline-none appearance-none cursor-pointer pr-10 transition-all duration-300 ${isStuck() ? 'px-3 py-2 text-sm' : 'px-4 py-3'}`}
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
            <button id="filter-submit-button" type="submit" class={`w-full btn-primary transition-all duration-300 ${isStuck() ? 'px-4 py-2 text-sm' : ''}`}>
              {isStuck() ? t('filters.filter') : t('filters.startSniffing')}
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
