import { createSignal, onMount, Show } from 'solid-js'
import { getPreferredLanguage, setPreferredLanguage, getAvailableLanguages, getLanguageName, type Language } from '../i18n'

export default function LanguageSwitcher() {
  const [currentLang, setCurrentLang] = createSignal<Language>('pl')
  const [isOpen, setIsOpen] = createSignal(false)

  onMount(() => {
    setCurrentLang(getPreferredLanguage())
  })

  const handleLanguageChange = (lang: Language) => {
    setPreferredLanguage(lang)
    setCurrentLang(lang)
    setIsOpen(false)
    window.location.reload()
  }

  const languages = getAvailableLanguages()

  return (
    <div class="relative">
      <button
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-2 px-3 py-2 text-sm font-bold text-inherit hover:opacity-80 transition-opacity"
        aria-label="Change language"
      >
        <span>{getLanguageName(currentLang())}</span>
        <svg
          class={`w-4 h-4 transition-transform ${isOpen() ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={isOpen()}>
        <div class="absolute bottom-full right-0 mb-2 bg-sys-paper-card rounded-lg shadow-lg border border-sys-paper-shadow py-2 min-w-[120px]">
          {languages.map((lang) => (
            <button
              onClick={() => handleLanguageChange(lang)}
              class={`w-full text-left px-4 py-2 text-sm font-bold transition-colors ${
                currentLang() === lang
                  ? 'text-sys-heart-core bg-sys-heart-core/10'
                  : 'text-sys-ink-primary hover:text-sys-heart-core hover:bg-sys-ink-primary/5'
              }`}
            >
              {getLanguageName(lang)}
            </button>
          ))}
        </div>
      </Show>
    </div>
  )
}
