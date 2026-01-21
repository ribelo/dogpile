import plTranslations from './pl.json'
import enTranslations from './en.json'

export type Language = 'pl' | 'en'
export type TranslationKey = keyof typeof plTranslations

const translations = {
  pl: plTranslations,
  en: enTranslations
} as const

export function getPreferredLanguage(): Language {
  if (typeof window === 'undefined') return 'pl'
  
  const stored = localStorage.getItem('dogpile-language')
  if (stored === 'pl' || stored === 'en') return stored
  
  const browserLang = navigator.language.slice(0, 2)
  return browserLang === 'en' ? 'en' : 'pl'
}

export function setPreferredLanguage(lang: Language) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('dogpile-language', lang)
  }
}

export function t(key: string, lang?: Language): string {
  const language = lang || getPreferredLanguage()
  const keys = key.split('.')
  
  let value: any = translations[language]
  for (const k of keys) {
    value = value?.[k]
  }
  
  if (typeof value !== 'string') {
    console.warn(`Missing translation for key: ${key} in language: ${language}`)
    // Fallback to Polish if English translation is missing
    if (language === 'en') {
      return t(key, 'pl')
    }
    return key
  }
  
  return value
}

export function getAvailableLanguages(): Language[] {
  return ['pl', 'en']
}

export function getLanguageName(lang: Language): string {
  return lang.toUpperCase()
}
