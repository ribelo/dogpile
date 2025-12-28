export interface Dog {
  id: string
  shelterId: string
  name: string
  breed: string | null
  ageMonths: number | null
  size: "small" | "medium" | "large" | null
  sex: "male" | "female" | "unknown"
  description: string | null
  personalityTags: string[]
  photos: string[]
  status: "available" | "adopted" | "reserved" | "removed"
  urgent: boolean
  city?: string
}
