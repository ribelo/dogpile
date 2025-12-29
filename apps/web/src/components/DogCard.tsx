import { createSignal } from "solid-js"
import type { Dog } from "./types"

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
  const photoUrl = () => props.dog.photos[0] || "/placeholder-dog.jpg"

  return (
    <article class="group card h-full flex flex-col relative">
      {props.dog.urgent && (
        <div class="absolute -top-2 -left-2 tag-urgent rotate-[-5deg] z-10 shadow-sm">
          Needs Sofa ASAP
        </div>
      )}

      <div class="relative h-64 w-full overflow-hidden rounded-paper mb-4">
        <img
          src={photoUrl()}
          alt={props.dog.name}
          class="nostalgia-img w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
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
            class="text-2xl text-sys-heart-core hover:scale-125 transition-transform"
            aria-label={isFavorite() ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite() ? "❤️" : "🤍"}
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

      <div class="border-t-2 border-dashed border-sys-paper-shadow pt-3 mt-auto flex justify-between items-center px-2">
        <span class="text-sm font-bold text-sys-ink-primary/50">
          🏠 {props.dog.locationCity || props.dog.locationName || "Unknown"}
          {props.dog.isFoster && " (foster)"}
        </span>
        <a
          href={`/dog/${props.dog.id}`}
          class="text-sys-heart-core font-bold text-sm hover:underline"
        >
          Read Story
        </a>
      </div>
    </article>
  )
}
