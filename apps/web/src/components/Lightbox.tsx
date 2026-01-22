import { Show, createSignal, createEffect, onCleanup, For } from "solid-js"
import { Portal } from "solid-js/web"
import { getPhotoUrl } from "../utils/photo-url"

interface LightboxProps {
  isOpen: boolean
  onClose: () => void
  photos: string[]
  photosGenerated: string[]
  initialIndex: number
  alt: string
}

export default function Lightbox(props: LightboxProps) {
  const [index, setIndex] = createSignal(props.initialIndex)

  const allPhotos = () => [...(props.photosGenerated || []), ...(props.photos || [])]
  const currentPhoto = () => allPhotos()[index()]
  const currentSrc = () => currentPhoto() ? getPhotoUrl(currentPhoto(), "lg") : '/placeholder-dog.jpg'

  const next = () => setIndex((i) => (i + 1) % allPhotos().length)
  const prev = () => setIndex((i) => (i - 1 + allPhotos().length) % allPhotos().length)

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose()
    }
  }

  const stopPropagation = (e: MouseEvent) => {
    e.stopPropagation()
  }

  createEffect(() => {
    const photos = allPhotos()
    const currentIdx = index()
    const nextIdx = (currentIdx + 1) % photos.length

    if (photos.length <= 1) return

    const nextSrc = getPhotoUrl(photos[nextIdx], "lg")
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.as = 'image'
    link.href = nextSrc
    document.head.appendChild(link)

    onCleanup(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link)
      }
    })
  })

  createEffect(() => {
    if (!props.isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          props.onClose()
          break
        case 'ArrowLeft':
          prev()
          break
        case 'ArrowRight':
          next()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => window.removeEventListener('keydown', handleKeyDown))
  })

  createEffect(() => {
    if (props.isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
  })

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div 
          class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={handleBackdropClick}
        >
          <button 
            class="absolute top-4 right-4 text-white/80 hover:text-white text-3xl p-2 z-10 transition-colors"
            onClick={props.onClose}
            aria-label="Zamknij pełnoekranowy widok"
          >
            ×
          </button>

          <div class="relative max-w-7xl max-h-[90vh] flex items-center" onClick={stopPropagation}>
            <Show when={allPhotos().length > 1}>
              <button 
                class="absolute left-4 p-3 bg-black/30 hover:bg-black/50 text-white rounded-full z-10 transition-colors"
                onClick={prev}
                aria-label="Poprzednie zdjęcie"
              >
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>

              <button 
                class="absolute right-4 p-3 bg-black/30 hover:bg-black/50 text-white rounded-full z-10 transition-colors"
                onClick={next}
                aria-label="Następne zdjęcie"
              >
                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </Show>

            <img 
              src={currentSrc()} 
              alt={props.alt}
              class="max-w-full max-h-[85vh] object-contain rounded-lg"
              loading="eager"
            />

            <Show when={allPhotos().length > 1}>
              <div class="absolute bottom-4 left-0 right-0 text-center text-white/70 text-sm font-bold">
                {index() + 1} / {allPhotos().length}
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
