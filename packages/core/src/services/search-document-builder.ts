import { Effect, Context, Layer } from "effect"

function polishYears(years: number): string {
  if (years === 1) return 'rok'
  const lastDigit = years % 10
  const lastTwoDigits = years % 100
  if (lastTwoDigits >= 12 && lastTwoDigits <= 14) return 'lat'
  if (lastDigit >= 2 && lastDigit <= 4) return 'lata'
  return 'lat'
}

export interface SearchDocument {
  id: string
  text: string
  metadata: {
    shelterId: string
    city?: string | undefined
    size?: string | undefined
    ageMonths?: number | undefined
    sex?: string | undefined
  }
}

interface DogInput {
  id: string
  shelterId: string
  name: string
  locationCity?: string | null
  sizeEstimate?: { value: string } | null
  ageEstimate?: { months: number } | null
  breedEstimates?: { breed: string }[]
  personalityTags?: string[]
  generatedBio?: string | null
  sex?: string | null
}

export interface SearchDocumentBuilderService {
  readonly build: (dog: DogInput) => Effect.Effect<SearchDocument>
}

export class SearchDocumentBuilder extends Context.Tag("SearchDocumentBuilder")<
  SearchDocumentBuilder,
  SearchDocumentBuilderService
>() {}

export const SearchDocumentBuilderLive = Layer.succeed(
  SearchDocumentBuilder,
  {
    build: (dog) => Effect.sync((): SearchDocument => {
      const parts: string[] = []
      
      parts.push(`Pies ${dog.name}`)
      
      if (dog.ageEstimate) {
        const months = dog.ageEstimate.months
        if (months < 12) {
          parts.push(`szczeniak ${months} miesięcy`)
        } else {
          const years = Math.floor(months / 12)
          parts.push(`${years} ${polishYears(years)}`)
        }
      }
      
      if (dog.sizeEstimate?.value) {
        const sizeMap: Record<string, string> = {
          small: "mały pies",
          medium: "średni pies", 
          large: "duży pies"
        }
        parts.push(sizeMap[dog.sizeEstimate.value] || dog.sizeEstimate.value)
      }
      
      if (dog.breedEstimates?.length) {
        const breed = dog.breedEstimates[0].breed.replace(/_/g, " ")
        parts.push(`rasa ${breed}`)
      }
      
      if (dog.locationCity) {
        parts.push(`z miasta ${dog.locationCity}`)
      }
      
      if (dog.sex === "male") parts.push("samiec")
      if (dog.sex === "female") parts.push("samica")
      
      if (dog.personalityTags?.length) {
        parts.push(dog.personalityTags.join(", "))
      }
      
      if (dog.generatedBio) {
        parts.push(dog.generatedBio)
      }
      
      return {
        id: dog.id,
        text: parts.join(". "),
        metadata: {
          shelterId: dog.shelterId,
          city: dog.locationCity ?? undefined,
          size: dog.sizeEstimate?.value ?? undefined,
          ageMonths: dog.ageEstimate?.months ?? undefined,
          sex: dog.sex ?? undefined,
        }
      }
    })
  }
)
