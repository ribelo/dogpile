import type { JobEnvelope } from './envelope'

export type PhotoVariant = 'professional' | 'nose'

export type ScrapeRunJob = JobEnvelope<
  'scrape.run',
  {
    shelterId: string
    shelterSlug: string
    baseUrl: string
  }
>

export type ImagesProcessOriginalJob = JobEnvelope<
  'images.processOriginal',
  {
    dogId: string
    urls: string[]
  }
>

export type PhotosGenerateJob = JobEnvelope<
  'photos.generate',
  {
    dogId: string
    variant: PhotoVariant
    force?: boolean
  }
>

export type SearchReindexJob = JobEnvelope<
  'search.reindex',
  {
    op: 'upsert' | 'delete'
    dogId: string
    description?: string
    metadata?: {
      shelterId?: string
      city?: string
      size?: string
      ageMonths?: number
      sex?: string
    }
  }
>
