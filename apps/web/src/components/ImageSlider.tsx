import { createSignal, Show, For } from "solid-js"

interface Props {
  photos: string[]
  photosGenerated: string[]
  alt: string
  class?: string
}

export default function ImageSlider(props: Props) {
  const [index, setIndex] = createSignal(0)
  
  // AI-generated photos first, then original
  const allPhotos = () => [...(props.photosGenerated || []), ...(props.photos || [])]
  
  const next = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    setIndex((i) => (i + 1) % allPhotos().length)
  }

  const prev = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    setIndex((i) => (i - 1 + allPhotos().length) % allPhotos().length)
  }

  return (
    <div class={`relative group overflow-hidden ${props.class || ''}`}>
      <img 
        src={allPhotos()[index()] || '/placeholder-dog.jpg'} 
        alt={props.alt}
        class="nostalgia-img w-full h-full object-cover transition-opacity duration-300"
        loading="lazy"
      />

      {/* Controls (only show if multiple photos) */}
      <Show when={allPhotos().length > 1}>
        <button 
          onClick={prev}
          class="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          aria-label="Previous photo"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button 
          onClick={next}
          class="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          aria-label="Next photo"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        
        {/* Dots */}
        <div class="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
          <For each={allPhotos()}>
            {(_, i) => (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIndex(i()) }}
                class={`w-2 h-2 rounded-full transition-colors ${i() === index() ? 'bg-white' : 'bg-white/50 hover:bg-white/70'}`}
                aria-label={`Go to photo ${i() + 1}`}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
