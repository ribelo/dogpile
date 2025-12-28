import type { CreateDogInput } from "@dogpile/core"

export const createHash = (dog: CreateDogInput): string => {
  const content = JSON.stringify({
    name: dog.name,
    sex: dog.sex,
    description: dog.description,
    breedEstimates: dog.breedEstimates,
    sizeEstimate: dog.sizeEstimate,
    ageEstimate: dog.ageEstimate,
    personalityTags: dog.personalityTags,
    photos: dog.photos,
    urgent: dog.urgent,
  })
  
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}
