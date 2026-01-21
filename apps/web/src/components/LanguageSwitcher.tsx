import { createSignal, Show } from 'solid-js'
import { getAvailableLanguages, getLanguageName, type Language } from '../i18n'

interface LanguageSwitcherProps {
  id?: string
}

export default function LanguageSwitcher(props: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = createSignal(false)
  const currentLang = () => (typeof document !== 'undefined' ? (document.documentElement.lang as Language) : 'pl')
  const availableLanguages = getAvailableLanguages()

  const handleLanguageChange = (lang: Language) => {
    const currentPath = window.location.pathname
    const segments = currentPath.split('/').filter(Boolean)
    
    // Check if current path has a language prefix
    const hasLangPrefix = availableLanguages.includes(segments[0] as Language)
    
    let newPath = currentPath
    if (hasLangPrefix) {
      segments[0] = lang
      newPath = '/' + segments.join('/')
    } else if (lang !== 'pl') {
      newPath = '/' + lang + currentPath
    }
    
    window.location.href = newPath
  }

  return (
    <div id={props.id} class="relative inline-block text-left">
      <button
        id={props.id ? `${props.id}-button` : undefined}
        onClick={() => setIsOpen(!isOpen())}
        class="flex items-center gap-1.5 px-2 py-1.5 text-xs font-black text-sys-ink-primary/60 hover:text-sys-ink-primary transition-colors border border-sys-paper-shadow rounded-lg bg-white/50"
        aria-label="Change language"
      >
        <span>{getLanguageName(currentLang())}</span>
        <svg
          class={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen() ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Show when={isOpen()}>
        <div class="absolute top-full right-0 mt-2 bg-sys-paper-card rounded-xl shadow-xl border border-sys-paper-shadow py-1.5 min-w-[80px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          {availableLanguages.map((lang) => (
            <button
              onClick={() => handleLanguageChange(lang)}
              class={`w-full text-left px-4 py-2 text-xs font-black transition-colors ${
                currentLang() === lang
                  ? 'text-sys-heart-core bg-sys-heart-core/5'
                  : 'text-sys-ink-primary/60 hover:text-sys-heart-core hover:bg-sys-ink-primary/5'
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
