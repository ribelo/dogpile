import { createSignal } from "solid-js"
import ImageSlider from "./ImageSlider"
import Lightbox from "./Lightbox"

interface DogDetailGalleryProps {
  photos: string[]
  photosGenerated: string[]
  alt: string
}

export default function DogDetailGallery(props: DogDetailGalleryProps) {
  const [isLightboxOpen, setIsLightboxOpen] = createSignal(false)
  const [lightboxIndex, setLightboxIndex] = createSignal(0)

  return (
    <>
      <ImageSlider
        photos={props.photos}
        photosGenerated={props.photosGenerated}
        alt={props.alt}
        class="w-full aspect-[4/5] rounded-sm"
        autoplay={true}
        interval={4000}
        loading="eager"
        enableLightbox={true}
        onOpenLightbox={(idx) => {
          setLightboxIndex(idx)
          setIsLightboxOpen(true)
        }}
      />
      <Lightbox
        isOpen={isLightboxOpen()}
        onClose={() => setIsLightboxOpen(false)}
        photos={props.photos}
        photosGenerated={props.photosGenerated}
        initialIndex={lightboxIndex()}
        alt={props.alt}
      />
    </>
  )
}
