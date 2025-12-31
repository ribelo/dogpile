const R2_PHOTOS_DOMAIN = "https://dogpile.extropy.club"
const R2_GENERATED_DOMAIN = "https://dogpile-generated.extropy.club"

export type PhotoSize = "sm" | "lg"

export function getPhotoUrl(photoKey: string, size: PhotoSize): string {
  if (photoKey.startsWith("http")) {
    return photoKey
  }

  if (photoKey.startsWith("generated/")) {
    const key = photoKey.slice("generated/".length)
    return `${R2_GENERATED_DOMAIN}/${key}-${size}.webp`
  }

  return `${R2_PHOTOS_DOMAIN}/${photoKey}-${size}.webp`
}

export function getPhotoSrcSet(photoKey: string): string {
  if (photoKey.startsWith("http")) {
    return ""
  }

  const sm = getPhotoUrl(photoKey, "sm")
  const lg = getPhotoUrl(photoKey, "lg")
  return `${sm} 400w, ${lg} 1200w`
}
