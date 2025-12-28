import { createResource, For, Show } from "solid-js"
import DogCard from "./DogCard"
import type { Dog } from "./types"

async function fetchDogs(): Promise<Dog[]> {
  const response = await fetch("/api/dogs")
  if (!response.ok) {
    throw new Error("Failed to fetch dogs")
  }
  const data = await response.json()
  return data.dogs
}

export default function DogGrid() {
  const [dogs] = createResource(fetchDogs)

  return (
    <section id="dogs" class="py-8">
      <div class="flex justify-between items-center mb-8">
        <h2 class="font-title text-4xl font-bold text-sys-ink-primary">
          sniff around
        </h2>
      </div>

      <Show when={dogs.loading}>
        <div class="text-center py-12 text-sys-ink-primary/50">
          Loading good boys and girls...
        </div>
      </Show>

      <Show when={dogs.error}>
        <div class="text-center py-12 text-sys-state-urgent">
          Failed to load dogs. Please try again.
        </div>
      </Show>

      <Show when={dogs()}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <For each={dogs()}>
            {(dog) => <DogCard dog={dog} />}
          </For>
        </div>
      </Show>
    </section>
  )
}
