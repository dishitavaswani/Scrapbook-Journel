import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

export interface PassportPlace {
  id: string;
  city: string;
  year: number;
  description: string;
  image?: string;
}

const DEFAULT_PLACES: PassportPlace[] = [
  {
    id: "pune-1991",
    city: "Pune",
    year: 1991,
    description: "Born and raised in Pune with the smell of monsoons, cardamom tea, and quiet study afternoons.",
    image: "https://images.unsplash.com/photo-1572914857229-37bf6ee8101c?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "mumbai-2011",
    city: "Mumbai",
    year: 2011,
    description: "Fast local trains, the salty breeze of Marine Drive, and big city dreams.",
    image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "nagpur-2003",
    city: "Nagpur",
    year: 2003,
    description: "Orange city explorations, quiet pavilions, family gatherings, and warm childhood summers.",
    image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "delft-2015",
    city: "Delft",
    year: 2015,
    description: "Canals, bicycles, Dutch cobblestones, and university days.",
    image: "https://images.unsplash.com/photo-1584003564911-a7a321c84e1c?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "den-haag-2016",
    city: "Den Haag",
    year: 2016,
    description: "Peace palaces, breezy coastlines, and weekend tram rides.",
    image: "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "amsterdam-2017",
    city: "Amsterdam",
    year: 2017,
    description: "Museum strolls, narrow canal houses, and endless spring tulips.",
    image: "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "paris-2018",
    city: "Paris",
    year: 2018,
    description: "Fresh morning baguettes, Seine strolls at golden hour, and art galleries.",
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "london-2019",
    city: "London",
    year: 2019,
    description: "Red buses, bookshops in Bloomsbury, and theatre evenings in the West End.",
    image: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "rome-2021",
    city: "Rome",
    year: 2021,
    description: "Ancient stones, espresso on every corner, and warm evening piazzas.",
    image: "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "madrid-2022",
    city: "Madrid",
    year: 2022,
    description: "Tapas under leafy boulevards and sunset walks in Retiro Park.",
    image: "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "barcelona-2023",
    city: "Barcelona",
    year: 2023,
    description: "Gaudí's architecture, Mediterranean blue, and vibrant street markets.",
    image: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "austin-2024",
    city: "Austin",
    year: 2024,
    description: "Live music, sunny trails along Lady Bird Lake, and warm southern smiles.",
    image: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=800&auto=format&fit=crop&q=80",
  },
  {
    id: "new-york-2025",
    city: "New York",
    year: 2025,
    description: "Skylines, autumn in Central Park, and unforgettable city lights.",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&auto=format&fit=crop&q=80",
  },
];

const TILTS = [-6, 4, -3, 7, -5, 2, -8, 5, -2, 6, -4, 3, -7];
const STORAGE_KEY = "prajakta_keepsake_passport_places";

function parseStoredPlaces(json: string | null): PassportPlace[] {
  if (!json) return DEFAULT_PLACES;
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data) && data.length > 0) {
      return data.map((item, index) => ({
        id: typeof item.id === "string" ? item.id : `place-${index}-${Date.now()}`,
        city: typeof item.city === "string" && item.city.trim() ? item.city.trim() : "Unknown City",
        year: typeof item.year === "number" && !isNaN(item.year) ? item.year : Number(item.year) || 2024,
        description: typeof item.description === "string" ? item.description : "",
        image: typeof item.image === "string" && (item.image.startsWith("data:") || item.image.startsWith("http")) ? item.image : undefined,
      }));
    }
    return DEFAULT_PLACES;
  } catch {
    return DEFAULT_PLACES;
  }
}

// Client-side image compression to safely store in localStorage
function compressImage(file: File, maxDim = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(e.target?.result as string);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PassportStamps() {
  const [places, setPlaces] = useState<PassportPlace[]>(DEFAULT_PLACES);
  const [selectedPlace, setSelectedPlace] = useState<PassportPlace | null>(null);
  const [hoveredPlace, setHoveredPlace] = useState<PassportPlace | null>(null);
  const [isEditingSelected, setIsEditingSelected] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Form states for Add / Edit
  const [formCity, setFormCity] = useState("");
  const [formYear, setFormYear] = useState<number | string>("");
  const [formDescription, setFormDescription] = useState("");
  const [formImage, setFormImage] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safe SSR hydration from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = parseStoredPlaces(stored);
      setPlaces(parsed);
    } catch {
      // Fallback to default places
    }
  }, []);

  const savePlacesToStorage = useCallback((updated: PassportPlace[]) => {
    setPlaces(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors (e.g. quota exceeded or private browsing)
    }
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAllModals();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function closeAllModals() {
    setSelectedPlace(null);
    setIsEditingSelected(false);
    setIsAddingNew(false);
    setFormError(null);
    setHoveredPlace(null);
  }

  function handleOpenPlace(place: PassportPlace) {
    setHoveredPlace(null);
    setSelectedPlace(place);
    setIsEditingSelected(false);
    setIsAddingNew(false);
    setFormCity(place.city);
    setFormYear(place.year);
    setFormDescription(place.description);
    setFormImage(place.image);
    setFormError(null);
  }

  function handleStartAdd() {
    setHoveredPlace(null);
    setIsAddingNew(true);
    setSelectedPlace(null);
    setIsEditingSelected(false);
    setFormCity("");
    setFormYear(new Date().getFullYear());
    setFormDescription("");
    setFormImage(undefined);
    setFormError(null);
  }

  function handleStartEdit() {
    if (!selectedPlace) return;
    setIsEditingSelected(true);
    setFormCity(selectedPlace.city);
    setFormYear(selectedPlace.year);
    setFormDescription(selectedPlace.description);
    setFormImage(selectedPlace.image);
    setFormError(null);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please select an image file (JPEG, PNG, or WebP)");
      return;
    }
    try {
      const compressed = await compressImage(file);
      setFormImage(compressed);
      setFormError(null);
    } catch {
      setFormError("Could not process image. Please try another file.");
    }
  }

  function handleSaveAdd(e: FormEvent) {
    e.preventDefault();
    const cityTrimmed = formCity.trim();
    if (!cityTrimmed) {
      setFormError("Please enter a city name");
      return;
    }
    const yearNum = Number(formYear) || new Date().getFullYear();
    const newPlace: PassportPlace = {
      id: `place-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      city: cityTrimmed,
      year: yearNum,
      description: formDescription.trim(),
      image: formImage,
    };
    const updated = [...places, newPlace];
    savePlacesToStorage(updated);
    closeAllModals();
  }

  function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!selectedPlace) return;
    const cityTrimmed = formCity.trim();
    if (!cityTrimmed) {
      setFormError("Please enter a city name");
      return;
    }
    const yearNum = Number(formYear) || selectedPlace.year;
    const updatedPlace: PassportPlace = {
      ...selectedPlace,
      city: cityTrimmed,
      year: yearNum,
      description: formDescription.trim(),
      image: formImage,
    };
    const updated = places.map((p) => (p.id === selectedPlace.id ? updatedPlace : p));
    savePlacesToStorage(updated);
    setSelectedPlace(updatedPlace);
    setIsEditingSelected(false);
    setFormError(null);
  }

  function handleDeletePlace(id: string) {
    if (typeof window !== "undefined") {
      const confirmDelete = window.confirm("Are you sure you want to remove this stamp from the passport?");
      if (!confirmDelete) return;
    }
    const updated = places.filter((p) => p.id !== id);
    savePlacesToStorage(updated);
    closeAllModals();
  }

  function handleResetPassport() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Reset the passport to the original 13 places?");
      if (!confirmed) return;
    }
    savePlacesToStorage(DEFAULT_PLACES);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore error
    }
    closeAllModals();
  }

  const field =
    "w-full rounded-sm border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold";

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 relative">
      {/* Background Dimming Overlay on hover */}
      <div
        className={`fixed inset-0 bg-black/35 z-20 pointer-events-none transition-opacity duration-300 ${
          hoveredPlace?.image && !selectedPlace && !isAddingNew ? "opacity-100" : "opacity-0"
        }`}
      />

      <p className="eyebrow text-center">Places that kept her</p>
      <h2 className="mt-3 text-center text-3xl text-ink">The passport pages</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted-foreground">
        Click any stamp to open the travel memory or photograph.
      </p>

      {/* Passport Stamps Grid */}
      <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
        {places.map((c, i) => {
          const isHovered = hoveredPlace?.id === c.id;
          const hasImage = Boolean(c.image);

          return (
            <div
              key={c.id}
              className={`relative ${isHovered ? "z-30" : "z-10"}`}
              onMouseEnter={() => {
                if (hasImage) setHoveredPlace(c);
              }}
              onMouseLeave={() => setHoveredPlace(null)}
            >
              {/* Floating Polaroid Photo Preview with Triangle Pointer */}
              {hasImage && isHovered && (
                <div
                  className="pointer-events-none absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 z-40 w-64 sm:w-72 transition-all duration-300 ease-out animate-in fade-in-0 zoom-in-95"
                >
                  <div className="paper hairline rounded-lg p-3.5 shadow-2xl bg-card border border-gold/30 relative">
                    <img
                      src={c.image}
                      alt={c.city}
                      className="w-full h-36 sm:h-40 object-cover rounded-md"
                    />
                    <div className="mt-3 text-center pb-0.5">
                      <h4 className="font-serif text-xl sm:text-2xl text-ink font-normal leading-tight">
                        {c.city} <span className="text-gold italic">· {c.year}</span>
                      </h4>
                      <div className="mt-1.5 flex items-center justify-center gap-2">
                        <span className="h-px w-6 bg-gold/40" />
                        <span className="text-gold text-xs leading-none">♥</span>
                        <span className="h-px w-6 bg-gold/40" />
                      </div>
                    </div>
                    {/* Downward triangle pointer */}
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-x-[8px] border-x-transparent border-t-[8px] border-t-card drop-shadow-sm" />
                  </div>
                </div>
              )}

              {/* Stamp Circle Button */}
              <button
                type="button"
                onClick={() => handleOpenPlace(c)}
                style={{ rotate: isHovered ? "0deg" : `${TILTS[i % TILTS.length]}deg` }}
                className={`flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed text-center transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gold/50 ${
                  isHovered
                    ? "border-gold bg-card scale-105 shadow-[0_0_35px_rgba(212,175,55,0.6),0_0_15px_rgba(212,175,55,0.35)] ring-2 ring-gold/40"
                    : "border-gold/60 bg-muted/40 hover:rotate-0 hover:scale-105 hover:bg-muted/60"
                }`}
                aria-label={`Open travel memory for ${c.city}, ${c.year}`}
              >
                <span className="text-[0.55rem] tracking-[0.28em] text-muted-foreground">
                  ARRIVED
                </span>
                <span className="mt-1 px-2 font-serif text-lg leading-tight text-ink">{c.city}</span>
                <span className="mt-1 text-[0.6rem] tracking-[0.2em] text-gold">{c.year}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Subtle Actions Bar */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs">
        <button
          type="button"
          onClick={handleStartAdd}
          className="inline-flex items-center gap-1.5 tracking-[0.24em] uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="text-gold font-bold text-sm">+</span> Add a place
        </button>
        <span className="text-border">·</span>
        <button
          type="button"
          onClick={handleResetPassport}
          className="eyebrow tracking-[0.2em] underline underline-offset-4 hover:text-foreground"
        >
          Reset passport
        </button>
      </div>

      {/* View Memory Modal */}
      {selectedPlace && !isEditingSelected && (
        <div
          role="presentation"
          onClick={closeAllModals}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 sm:p-6 backdrop-blur-xs"
        >
          <article
            onClick={(e) => e.stopPropagation()}
            className="paper hairline relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm p-6 sm:p-8"
          >
            <button
              type="button"
              onClick={closeAllModals}
              aria-label="Close"
              className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground text-sm font-sans"
            >
              ✕
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full border border-dashed border-gold/70 bg-muted/60 text-center">
                <span className="text-[0.45rem] tracking-[0.2em] text-muted-foreground">PASSPORT</span>
                <span className="text-[0.65rem] font-serif font-bold text-gold">{selectedPlace.year}</span>
              </div>
              <div>
                <p className="eyebrow">Passport stamp · Arrived {selectedPlace.year}</p>
                <h3 className="font-serif text-3xl text-ink leading-none mt-1">{selectedPlace.city}</h3>
              </div>
            </div>

            {selectedPlace.image && (
              <figure className="mt-6 overflow-hidden rounded-sm border border-input/60 bg-muted/30">
                <img
                  src={selectedPlace.image}
                  alt={`Memory from ${selectedPlace.city}`}
                  className="max-h-72 w-full object-cover rounded-sm"
                />
              </figure>
            )}

            <div className="mt-6 border-t border-border/70 pt-4">
              <p className="font-serif text-lg leading-relaxed text-ink/90 italic">
                {selectedPlace.description || "A memorable chapter in her journey."}
              </p>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={handleStartEdit}
                className="rounded-sm border border-input px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-colors hover:bg-accent"
              >
                ✎ Edit
              </button>
              <button
                type="button"
                onClick={closeAllModals}
                className="rounded-sm bg-primary px-5 py-2 text-xs tracking-[0.2em] uppercase text-primary-foreground transition-opacity hover:opacity-90"
              >
                Close
              </button>
            </div>
          </article>
        </div>
      )}

      {/* Edit Memory Modal */}
      {selectedPlace && isEditingSelected && (
        <div
          role="presentation"
          onClick={closeAllModals}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 sm:p-6 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveEdit}
            onClick={(e) => e.stopPropagation()}
            className="paper hairline relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm p-6 sm:p-8"
          >
            <button
              type="button"
              onClick={closeAllModals}
              aria-label="Close"
              className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground text-sm font-sans"
            >
              ✕
            </button>

            <p className="eyebrow">Editing memory</p>
            <h3 className="mt-1 font-serif text-2xl text-ink">Edit {selectedPlace.city}</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">City name</label>
                <input
                  className={field}
                  value={formCity}
                  maxLength={50}
                  required
                  onChange={(e) => setFormCity(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Year</label>
                <input
                  type="number"
                  className={field}
                  value={formYear}
                  min={1900}
                  max={2100}
                  required
                  onChange={(e) => setFormYear(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.16em] file:text-foreground"
              />
              {formImage && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={formImage} alt="Preview" className="h-14 w-14 rounded-sm object-cover border border-input" />
                  <button
                    type="button"
                    onClick={() => {
                      setFormImage(undefined);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Memory / Story</label>
              <textarea
                className={`${field} min-h-24 resize-none`}
                placeholder="A little story about this place..."
                maxLength={400}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            {formError && <p className="mt-3 text-xs text-destructive">{formError}</p>}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={() => handleDeletePlace(selectedPlace.id)}
                className="text-xs tracking-[0.2em] uppercase text-muted-foreground hover:text-destructive transition-colors"
              >
                Delete Place
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingSelected(false)}
                  className="rounded-sm border border-input px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-sm bg-primary px-5 py-2 text-xs tracking-[0.2em] uppercase text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Add New Place Modal */}
      {isAddingNew && (
        <div
          role="presentation"
          onClick={closeAllModals}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 p-4 sm:p-6 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveAdd}
            onClick={(e) => e.stopPropagation()}
            className="paper hairline relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-sm p-6 sm:p-8"
          >
            <button
              type="button"
              onClick={closeAllModals}
              aria-label="Close"
              className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground text-sm font-sans"
            >
              ✕
            </button>

            <p className="eyebrow">New destination</p>
            <h3 className="mt-1 font-serif text-2xl text-ink">Add a passport stamp</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">City name</label>
                <input
                  className={field}
                  placeholder="e.g. Kyoto"
                  value={formCity}
                  maxLength={50}
                  required
                  onChange={(e) => setFormCity(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Year</label>
                <input
                  type="number"
                  className={field}
                  value={formYear}
                  min={1900}
                  max={2100}
                  required
                  onChange={(e) => setFormYear(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Photo (optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.16em] file:text-foreground"
              />
              {formImage && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={formImage} alt="Preview" className="h-14 w-14 rounded-sm object-cover border border-input" />
                  <button
                    type="button"
                    onClick={() => {
                      setFormImage(undefined);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Memory / Story</label>
              <textarea
                className={`${field} min-h-24 resize-none`}
                placeholder="A little story about this place..."
                maxLength={400}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            {formError && <p className="mt-3 text-xs text-destructive">{formError}</p>}

            <div className="mt-6 flex items-center justify-end gap-2 border-t border-border/70 pt-4">
              <button
                type="button"
                onClick={closeAllModals}
                className="rounded-sm border border-input px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-sm bg-primary px-5 py-2 text-xs tracking-[0.2em] uppercase text-primary-foreground transition-opacity hover:opacity-90"
              >
                Add Place
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
