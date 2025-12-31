import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileFilterSheet(props: MobileFilterSheetProps) {
  const [shouldRender, setShouldRender] = createSignal(props.isOpen);
  const [isAnimating, setIsAnimating] = createSignal(false);
  let sheetRef: HTMLDivElement | undefined;

  // Handle open/close animation and mounting
  createEffect(() => {
    if (props.isOpen) {
      setShouldRender(true);
      // Small delay to allow DOM render before starting transition
      requestAnimationFrame(() => {
        setIsAnimating(true);
        // Focus trap initialization could go here
        sheetRef?.focus();
      });
      document.body.style.overflow = "hidden";
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
        document.body.style.overflow = "";
      }, 300);
      onCleanup(() => clearTimeout(timer));
    }
  });

  // Handle Escape key
  createEffect(() => {
    if (!props.isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    
    window.addEventListener("keydown", handleEscape);
    onCleanup(() => window.removeEventListener("keydown", handleEscape));
  });

  // Filter State
  const [location, setLocation] = createSignal("");
  const [size, setSize] = createSignal("");
  const [age, setAge] = createSignal("");
  const [energy, setEnergy] = createSignal("");

  const handleClear = () => {
    setLocation("");
    setSize("");
    setAge("");
    setEnergy("");
  };

  return (
    <Show when={shouldRender()}>
      <Portal>
        <div 
          class="fixed inset-0 z-50 flex items-end justify-center sm:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div 
            class={`absolute inset-0 bg-sys-ink-primary/50 backdrop-blur-sm transition-opacity duration-300 ${
              isAnimating() ? "opacity-100" : "opacity-0"
            }`}
            onClick={props.onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            tabIndex={-1}
            class={`relative w-full bg-sys-paper-card max-h-[90vh] flex flex-col shadow-2xl transition-transform duration-300 ease-out outline-none ${
              isAnimating() ? "translate-y-0" : "translate-y-full"
            }`}
            style={{
              "border-radius": "25px 25px 0 0",
              "box-shadow": "0 -4px 20px rgba(0,0,0,0.1)"
            }}
          >
            {/* Handle */}
            <div class="w-full flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing">
              <div class="w-12 h-1.5 bg-sys-ink-primary/20 rounded-full" />
            </div>

            {/* Header */}
            <div class="px-6 py-4 flex items-center justify-between border-b border-sys-ink-primary/5 flex-shrink-0">
              <h2 class="text-xl font-bold font-title text-sys-ink-primary">Filter Dogs</h2>
              <button 
                onClick={props.onClose}
                class="p-2 hover:bg-sys-ink-primary/5 rounded-full transition-colors"
                aria-label="Close filters"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Content */}
            <div class="px-6 py-6 overflow-y-auto space-y-8 flex-1">
              {/* Location */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">Location</label>
                <div class="relative">
                  <select 
                    value={location()}
                    onChange={(e) => setLocation(e.currentTarget.value)}
                    class="filter-input w-full appearance-none"
                  >
                    <option value="" disabled selected>Select Area</option>
                    <option value="warszawa">Warszawa</option>
                    <option value="krakow">Kraków</option>
                    <option value="gdansk">Gdańsk</option>
                    <option value="wroclaw">Wrocław</option>
                    <option value="poznan">Poznań</option>
                  </select>
                  <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Size */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">Size</label>
                <div class="relative">
                  <select 
                    value={size()}
                    onChange={(e) => setSize(e.currentTarget.value)}
                    class="filter-input w-full appearance-none"
                  >
                    <option value="" disabled selected>Any Size</option>
                    <option value="small">Small (0-25 lbs)</option>
                    <option value="medium">Medium (26-60 lbs)</option>
                    <option value="large">Large (61-100 lbs)</option>
                    <option value="xl">Extra Large (100+ lbs)</option>
                  </select>
                  <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Age */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">Age</label>
                <div class="grid grid-cols-2 gap-3">
                  {["Puppy", "Young", "Adult", "Senior"].map((a) => (
                    <button
                      onClick={() => setAge(a === age() ? "" : a)}
                      class={`py-3 px-4 rounded-xl border-2 font-bold transition-all ${
                        age() === a 
                          ? "bg-sys-heart-core text-white border-sys-heart-core shadow-md scale-[1.02]" 
                          : "bg-white border-sys-paper-shadow text-sys-ink-primary hover:border-sys-heart-core/50"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">Energy Level</label>
                <div class="flex gap-2">
                  {["Low", "Medium", "High"].map((e) => (
                    <button
                      onClick={() => setEnergy(e === energy() ? "" : e)}
                      class={`flex-1 py-3 px-2 rounded-xl border-2 font-bold transition-all ${
                        energy() === e
                          ? "bg-sys-heart-core text-white border-sys-heart-core shadow-md" 
                          : "bg-white border-sys-paper-shadow text-sys-ink-primary hover:border-sys-heart-core/50"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Spacer for sticky footer */}
              <div class="h-4" />
            </div>

            {/* Footer */}
            <div class="p-6 border-t border-sys-ink-primary/5 bg-sys-paper-card flex-shrink-0 flex gap-4">
              <button 
                onClick={handleClear}
                class="btn-secondary flex-1 justify-center"
              >
                Clear
              </button>
              <button 
                onClick={props.onClose}
                class="btn-primary flex-1 justify-center shadow-lg shadow-sys-heart-core/20"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
