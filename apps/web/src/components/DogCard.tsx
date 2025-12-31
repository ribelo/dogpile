import { createSignal } from "solid-js"
import type { Dog } from "./types"
import ImageSlider from "./ImageSlider"

interface Props {
  dog: Dog
}

function formatAge(ageEstimate: Dog["ageEstimate"]): string | null {
  if (!ageEstimate) return null
  const months = ageEstimate.months
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  return `${years} yr${years > 1 ? "s" : ""}`
}

function formatBreed(breedEstimates: Dog["breedEstimates"]): string | null {
  if (!breedEstimates.length) return null
  const top = breedEstimates[0]
  const formatted = top.breed.replace(/_/g, " ")
  if (breedEstimates.length > 1) {
    return `${formatted} mix`
  }
  return formatted
}

export default function DogCard(props: Props) {
  const [isFavorite, setIsFavorite] = createSignal(
    typeof localStorage !== "undefined" &&
    localStorage.getItem(`favorite-${props.dog.id}`) === "true"
  )

  const toggleFavorite = () => {
    const newValue = !isFavorite()
    setIsFavorite(newValue)
    if (typeof localStorage !== "undefined") {
      if (newValue) {
        localStorage.setItem(`favorite-${props.dog.id}`, "true")
      } else {
        localStorage.removeItem(`favorite-${props.dog.id}`)
      }
    }
  }

  const age = () => formatAge(props.dog.ageEstimate)
  const breed = () => formatBreed(props.dog.breedEstimates)
  const size = () => props.dog.sizeEstimate?.value

  return (
    <article class="group card card-appear h-full flex flex-col relative !p-3">
      {props.dog.urgent && (
        <div class="absolute -top-2 -left-2 tag-urgent rotate-[-5deg] z-10 shadow-sm">
          Needs Sofa ASAP
        </div>
      )}

      <div class="relative aspect-[4/5] w-full overflow-hidden rounded-paper-img mb-4">
        <ImageSlider 
          photos={props.dog.photos} 
          photosGenerated={props.dog.photosGenerated} 
          alt={props.dog.name} 
          class="h-full w-full" 
        />
        <div class="absolute top-4 right-4 flex gap-2">
          {age() && (
            <span class="bg-sys-paper-card px-3 py-1 rounded-full text-xs font-bold text-sys-ink-primary shadow-sm rotate-3">
              {age()}
            </span>
          )}
          {size() && (
            <span class="bg-sys-paper-card px-3 py-1 rounded-full text-xs font-bold text-sys-ink-primary shadow-sm -rotate-2">
              {size()}
            </span>
          )}
        </div>
      </div>

      <div class="px-2 pb-2 flex-grow">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 class="font-title text-3xl font-bold text-sys-ink-primary group-hover:text-sys-heart-core transition-colors">
              {props.dog.name}
            </h3>
            {breed() && (
              <p class="text-sm text-sys-ink-primary/60">{breed()}</p>
            )}
          </div>
          <button
            onClick={toggleFavorite}
            class="text-sys-heart-core transition-transform hover:scale-110 active:scale-125"
            class:heart-pop={isFavorite()}
            aria-label={isFavorite() ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite() ? (
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 10-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            ) : (
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
          </button>
        </div>

        {props.dog.generatedBio && (
          <p class="text-sys-ink-primary/70 mb-4 line-clamp-2 italic">
            "{props.dog.generatedBio}"
          </p>
        )}

        <div class="flex flex-wrap gap-2 mb-4">
          {props.dog.personalityTags.slice(0, 3).map((tag) => (
            <span class="tag-sky">#{tag}</span>
          ))}
          {props.dog.goodWithKids && (
            <span class="tag-grass">👶 kids ok</span>
          )}
          {props.dog.goodWithDogs && (
            <span class="tag-grass">🐕 dogs ok</span>
          )}
          {props.dog.goodWithCats && (
            <span class="tag-grass">🐱 cats ok</span>
          )}
        </div>
      </div>

      <div class="border-t-2 border-dashed border-sys-paper-shadow pt-3 mt-auto flex justify-between items-center">
        <span class="text-sm font-bold text-sys-ink-primary/50 flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          {props.dog.locationCity || props.dog.locationName || "Unknown"}
          {props.dog.isFoster && " (foster)"}
        </span>
        <a
          href={`/dogs/${props.dog.id}`}
          class="link-arrow text-sys-heart-core font-bold text-sm hover:underline"
        >
          Read Story
        </a>
      </div>
    </article>
  )
}
