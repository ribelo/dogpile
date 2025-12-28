import type { CreateDog } from "@dogpile/core"

export const createHash = (dog: CreateDog): string => {
  const content = JSON.stringify({
    name: dog.name,
    breed: dog.breed,
    ageMonths: dog.ageMonths,
    size: dog.size,
    sex: dog.sex,
    description: dog.description,
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
