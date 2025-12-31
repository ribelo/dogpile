# Image Optimization Pipeline Design

## Overview

This document describes the image optimization pipeline for dogpile, designed to:
1. **Reliability**: Cache shelter photos to R2 (shelters often remove dogs/images)
2. **Performance**: Serve optimized WebP images in multiple sizes
3. **Cost efficiency**: Use Cloudflare's free tier (5,000 transformations/month)

## Architecture

### Queue-Based Processing

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  scraper-processor  │────▶│  dogpile-image-jobs │────▶│  scraper-processor  │
│  (scrape consumer)  │     │      (Queue)        │     │  (image consumer)   │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │                                                        │
         │ Insert dog with                                        │ Fetch → Transform
         │ external URLs                                          │ → Upload to R2
         ▼                                                        ▼
    ┌─────────┐                                             ┌─────────┐
    │   D1    │◀────────────────────────────────────────────│   R2    │
    └─────────┘        Update photos[] with R2 keys         └─────────┘
```

### Single Worker, Two Queue Consumers

The `scraper-processor` worker handles two queues:
- `dogpile-scrape-jobs`: Scrapes shelter HTML, inserts dogs with external photo URLs
- `dogpile-image-jobs`: Downloads photos, transforms, uploads to R2, updates DB

This avoids creating a separate worker while keeping processing decoupled.

## Image Sizes

| Size | Width | Quality | Use Case |
|------|-------|---------|----------|
| `sm` | 400px | 80% | Grid cards, thumbnails |
| `lg` | 1200px | 85% | Detail page, lightbox |

Format: **WebP** (97%+ browser support, best size/quality ratio)

## R2 Key Structure

```
dogs/{dogId}/{urlHash}-{size}.webp

Examples:
dogs/abc123/f7a3c2b1-sm.webp
dogs/abc123/f7a3c2b1-lg.webp
```

- `dogId`: Dog's database ID (enables easy cleanup on deletion)
- `urlHash`: First 8 chars of SHA-256 of source URL (deduplication)
- `size`: `sm` or `lg`

## Implementation Details

### 1. Queue Message Format

```typescript
interface ImageJob {
  dogId: string
  urls: string[]  // External URLs to process
}
```

### 2. Processing Flow

```typescript
for (const url of job.urls) {
  // 1. Generate hash for deduplication
  const hash = await sha256(url).slice(0, 8)
  
  // 2. Check if already processed
  const exists = await env.PHOTOS_ORIGINAL.head(`dogs/${dogId}/${hash}-lg.webp`)
  if (exists) continue
  
  // 3. Fetch from source
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  
  // 4. Transform to sizes
  const [sm, lg] = await Promise.all([
    env.IMAGES.input(buffer).transform({ width: 400 }).output({ format: 'image/webp' }),
    env.IMAGES.input(buffer).transform({ width: 1200 }).output({ format: 'image/webp' })
  ])
  
  // 5. Upload to R2
  await Promise.all([
    env.PHOTOS_ORIGINAL.put(`dogs/${dogId}/${hash}-sm.webp`, await sm.response().arrayBuffer()),
    env.PHOTOS_ORIGINAL.put(`dogs/${dogId}/${hash}-lg.webp`, await lg.response().arrayBuffer())
  ])
}

// 6. Update DB with R2 keys (replace external URLs)
```

### 3. Database Schema

No schema changes needed. The `photos` column will store R2 keys instead of external URLs:

Before: `["https://shelter.pl/img/dog1.jpg", "https://shelter.pl/img/dog2.jpg"]`
After: `["dogs/abc123/f7a3c2b1", "dogs/abc123/e2d4f6a8"]`

The frontend constructs full URLs with size suffix.

### 4. Frontend URL Construction

```typescript
// In ImageSlider.tsx / DogCard.tsx
const getPhotoUrl = (photoKey: string, size: 'sm' | 'lg') => {
  if (photoKey.startsWith('http')) {
    // Legacy: external URL (during migration)
    return photoKey
  }
  return `https://photos.dogpile.pl/${photoKey}-${size}.webp`
}
```

### 5. srcset for Responsive Images

```tsx
<img
  src={getPhotoUrl(photo, 'lg')}
  srcset={`${getPhotoUrl(photo, 'sm')} 400w, ${getPhotoUrl(photo, 'lg')} 1200w`}
  sizes="(max-width: 640px) 400px, 1200px"
/>
```

## Cost Analysis

### Cloudflare Images (Free Tier)
- 5,000 unique transformations/month
- ~100 dogs × 3 photos × 2 sizes = 600 transformations/scrape cycle
- Fits comfortably in free tier

### R2 Storage
- Free: 10GB storage, 1M Class A ops, 10M Class B ops
- Estimated: ~500KB per dog (2 sizes × 3 photos) = 50MB for 100 dogs
- Fits in free tier

## Migration Strategy

1. Deploy updated scraper-processor with image queue
2. New dogs get R2 photos automatically
3. Create backfill script to enqueue existing dogs with external URLs
4. Frontend handles both external URLs and R2 keys during transition

## Error Handling

- **Source fetch fails**: Retry queue message (max 3 retries)
- **Transform fails**: Log warning, keep external URL
- **R2 upload fails**: Retry queue message
- **Partial success**: Update DB with successful photos only

## Future Improvements

1. **Original archival**: Store original in `/original/` prefix for reprocessing
2. **AVIF support**: Add AVIF variant for modern browsers
3. **Lazy deletion**: Clean up R2 when dog is removed
