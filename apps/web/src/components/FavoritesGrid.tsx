import { createSignal, onMount } from "solid-js"
import DogGrid from "./DogGrid"

interface FavoritesGridProps {
  apiUrl: string
}

export default function FavoritesGrid(props: FavoritesGridProps) {
  const [favoriteIds, setFavoriteIds] = createSignal<string[]>([])
  const [isLoaded, setIsLoaded] = createSignal(false)

  onMount(() => {
    const ids: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('favorite-')) {
        const val = localStorage.getItem(key)
        if (val === 'true') {
          ids.push(key.replace('favorite-', ''))
        }
      }
    }
    setFavoriteIds(ids)
    setIsLoaded(true)
  })

  return (
    <div>
      {isLoaded() && (
        <DogGrid 
          apiUrl={props.apiUrl} 
          filters={{ ids: favoriteIds().length > 0 ? favoriteIds() : ['none-found-placeholder'] }} 
        />
      )}
    </div>
  )
}
