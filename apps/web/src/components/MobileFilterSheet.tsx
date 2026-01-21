import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { t } from "../i18n";
import { CITIES } from "../constants/filters";

interface MobileFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onFilter?: (filters: any) => void;
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
  const [city, setCity] = createSignal("");
  const [size, setSize] = createSignal("");
  const [sex, setSex] = createSignal("");
  const [age, setAge] = createSignal("");
  const [energy, setEnergy] = createSignal("");

  const handleClear = () => {
    setCity("");
    setSize("");
    setSex("");
    setAge("");
    setEnergy("");
  };

  const handleApply = () => {
    const filters = {
      city: city() || undefined,
      size: size() || undefined,
      sex: sex() || undefined,
      age: age() || undefined,
      energy: energy() || undefined,
    };
    const event = new CustomEvent('dog-filters-changed', { detail: filters });
    window.dispatchEvent(event);
    props.onClose();
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
              <h2 class="text-xl font-bold font-title text-sys-ink-primary">{t('filters.title')}</h2>
              <button 
                onClick={props.onClose}
                class="p-2 hover:bg-sys-ink-primary/5 rounded-full transition-colors"
                aria-label="Close"
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
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">{t('filters.location')}</label>
                <div class="relative">
                  <select 
                    value={city()}
                    onInput={(e) => setCity(e.currentTarget.value)}
                    class="filter-input w-full appearance-none"
                  >
                    <option value="">{t('filters.anywhere')}</option>
                    {CITIES.map(c => (
                      <option value={c}>{c}</option>
                    ))}
                  </select>
                  <div class="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-sys-ink-primary/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Sex */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">{t('filters.sex')}</label>
                <div class="relative">
                  <select 
                    value={sex()}
                    onInput={(e) => setSex(e.currentTarget.value)}
                    class="filter-input w-full appearance-none"
                  >
                    <option value="">{t('filters.doesntMatter')}</option>
                    <option value="male">{t('filters.male')}</option>
                    <option value="female">{t('filters.female')}</option>
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
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">{t('filters.size')}</label>
                <div class="relative">
                  <select 
                    value={size()}
                    onInput={(e) => setSize(e.currentTarget.value)}
                    class="filter-input w-full appearance-none"
                  >
                    <option value="">{t('filters.doesntMatter')}</option>
                    <option value="small">{t('filters.pocketSized')}</option>
                    <option value="medium">{t('filters.armful')}</option>
                    <option value="large">{t('filters.bigBear')}</option>
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
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">{t('filters.age')}</label>
                <div class="grid grid-cols-2 gap-3">
                  {[
                    { key: "Puppy", label: t('filters.puppy') },
                    { key: "Young", label: t('filters.young') },
                    { key: "Adult", label: t('filters.adult') },
                    { key: "Senior", label: t('filters.senior') }
                  ].map((a) => (
                    <button
                      onClick={() => setAge(a.key === age() ? "" : a.key)}
                      class={`py-3 px-4 rounded-xl border-2 font-bold transition-all ${
                        age() === a.key 
                          ? "bg-sys-heart-core text-white border-sys-heart-core shadow-md scale-[1.02]" 
                          : "bg-white border-sys-paper-shadow text-sys-ink-primary hover:border-sys-heart-core/50"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy */}
              <div class="space-y-3">
                <label class="text-sm font-bold uppercase tracking-wider text-sys-ink-primary/60">{t('filters.energy')}</label>
                <div class="flex gap-2">
                  {[
                    { key: "Low", label: t('filters.low') },
                    { key: "Medium", label: t('filters.medium') },
                    { key: "High", label: t('filters.high') }
                  ].map((e) => (
                    <button
                      onClick={() => setEnergy(e.key === energy() ? "" : e.key)}
                      class={`flex-1 py-3 px-2 rounded-xl border-2 font-bold transition-all ${
                        energy() === e.key
                          ? "bg-sys-heart-core text-white border-sys-heart-core shadow-md" 
                          : "bg-white border-sys-paper-shadow text-sys-ink-primary hover:border-sys-heart-core/50"
                      }`}
                    >
                      {e.label}
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
                {t('filters.clear')}
              </button>
              <button 
                onClick={handleApply}
                class="btn-primary flex-1 justify-center shadow-lg shadow-sys-heart-core/20"
              >
                {t('filters.apply')}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
