export interface BreedEstimate {
  breed: string
  confidence: number
}

export interface SizeEstimate {
  value: "small" | "medium" | "large"
  confidence: number
}

export interface AgeEstimate {
  months: number
  confidence: number
  rangeMin: number
  rangeMax: number
}

export interface WeightEstimate {
  kg: number
  confidence: number
  rangeMin: number
  rangeMax: number
}

export interface Dog {
  id: string
  shelterId: string
  name: string
  sex: "male" | "female" | "unknown" | null
  description: string | null
  
  // Location
  locationName: string | null
  locationCity: string | null
  locationLat: number | null
  locationLng: number | null
  isFoster: boolean | null
  
  // AI estimations
  breedEstimates: BreedEstimate[]
  sizeEstimate: SizeEstimate | null
  ageEstimate: AgeEstimate | null
  weightEstimate: WeightEstimate | null
  
  personalityTags: string[]
  
  // Health
  vaccinated: boolean | null
  sterilized: boolean | null
  chipped: boolean | null
  
  // Compatibility
  goodWithKids: boolean | null
  goodWithDogs: boolean | null
  goodWithCats: boolean | null
  
  // Photo extraction
  furLength: "short" | "medium" | "long" | null
  furType: "smooth" | "wire" | "curly" | "double" | null
  colorPrimary: string | null
  colorSecondary: string | null
  colorPattern: string | null
  earType: "floppy" | "erect" | "semi" | null
  tailType: "long" | "short" | "docked" | "curled" | null
  
  // Photos
  photos: string[]
  photosGenerated: string[]
  
  // Meta
  sourceUrl: string | null
  urgent: boolean
  status: "available" | "adopted" | "reserved" | "removed"
}
