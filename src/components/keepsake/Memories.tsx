import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { addMemory, deleteMemory, listMemories } from "@/lib/memories.functions";

type Memory = {
  id: string;
  caption: string;
  addedBy: string | null;
  storagePath: string;
  url: string | null;
};

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 160;

export function Memories() {
  const fetchMemories = useServerFn(listMemories);
  const executeAddMemory = useServerFn(addMemory);
  const executeDeleteMemory = useServerFn(deleteMemory);

  const [items, setItems] = useState<Memory[]>([]);
  const [caption, setCaption] = useState("");
  const [addedBy, setAddedBy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<Memory | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Delete modal state
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchMemories();
      if (Array.isArray(data)) {
        setItems(data as Memory[]);
      }
    } catch (err) {
      console.warn("[Memories] Server function error:", err);
    }
  }, [fetchMemories]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Handle Escape key to close modals
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLightbox(null);
        setMemoryToDelete(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = caption.trim();

    if (!file) {
      setError("Please choose a photo to upload");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (JPG, PNG, WebP)");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Please keep photo file size under 8 MB");
      return;
    }
    if (trimmed.length < 1 || trimmed.length > MAX_CAPTION_LENGTH) {
      setError(`Please add a short note (up to ${MAX_CAPTION_LENGTH} characters)`);
      return;
    }

    try {
      setBusy(true);

      // Read file into Base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
      });

      const fileBase64 = await base64Promise;

      // Save via server function (writes file and persists memory entry)
      const res = await executeAddMemory({
        data: {
          fileBase64,
          fileName: file.name,
          caption: trimmed,
          addedBy: addedBy.trim() || undefined,
        },
      });

      if (!res?.ok) {
        throw new Error("Could not add photo to scrapbook");
      }

      setBusy(false);
      setSuccess("Added to the scrapbook ✦");
      setCaption("");
      setAddedBy("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";

      await refresh();

      setTimeout(() => {
        setSuccess(null);
      }, 4500);
    } catch (err: any) {
      console.error("[Memories] Unexpected upload error:", err);
      setBusy(false);
      setError(err?.message || "An unexpected error occurred. Please try again.");
    }
  }

  async function handleConfirmDelete(e: FormEvent) {
    e.preventDefault();
    if (!memoryToDelete || deleteBusy) return;
    setDeleteError(null);
    setDeleteBusy(true);

    try {
      const res = await executeDeleteMemory({
        data: {
          id: memoryToDelete.id,
        },
      });

      if (res?.ok) {
        // Immediate UI removal
        setItems((prev) => prev.filter((m) => m.id !== memoryToDelete.id));
        setMemoryToDelete(null);
        setLightbox(null);
        setDeleteBusy(false);
        setSuccess("Memory removed from the scrapbook ✦");
        await refresh();

        setTimeout(() => setSuccess(null), 4000);
      } else {
        throw new Error("Failed to delete memory");
      }
    } catch (err: any) {
      console.error("[Memories] Delete failed:", err);
      setDeleteBusy(false);
      setDeleteError(err?.message || "Could not delete memory. Please try again.");
    }
  }

  const field =
    "w-full rounded-sm border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold font-sans";

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <p className="eyebrow text-center">Pinned to the page</p>
      <h2 className="mt-3 text-center text-3xl text-ink">The memories gallery</h2>
      <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
        Add a photo and a line about it. Everything lands straight on the scrapbook.
      </p>

      {/* Upload Form */}
      <form onSubmit={onSubmit} className="paper hairline mx-auto mt-10 max-w-xl rounded-sm p-7">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Photo</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.16em] file:text-foreground cursor-pointer"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-muted-foreground">Your memory</label>
              <span className="text-[0.65rem] text-muted-foreground">
                {caption.length}/{MAX_CAPTION_LENGTH}
              </span>
            </div>
            <textarea
              className={`${field} min-h-20 resize-none`}
              placeholder="A short note about this photo…"
              maxLength={MAX_CAPTION_LENGTH}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Your name (optional)</label>
            <input
              className={field}
              placeholder="Your name"
              maxLength={60}
              value={addedBy}
              onChange={(e) => setAddedBy(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-4">
          <div className="text-xs">
            {error ? (
              <span className="text-destructive font-medium">{error}</span>
            ) : success ? (
              <span className="text-gold font-medium">{success}</span>
            ) : (
              <span className="text-muted-foreground">JPG or PNG, up to 8 MB</span>
            )}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-sm bg-primary px-6 py-2.5 text-xs tracking-[0.24em] uppercase text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {busy ? "Adding…" : "Add Photo"}
          </button>
        </div>
      </form>

      {/* Scrapbook Gallery Grid */}
      {items.length > 0 ? (
        <div className="mt-14 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {items.map((m) => {
            const isBroken = !m.url || brokenImages[m.id];
            return (
              <figure
                key={m.id}
                className="paper hairline mb-6 break-inside-avoid rounded-sm p-3.5 transition-all duration-300 hover:scale-[1.02] group shadow-sm hover:shadow-md relative"
              >
                {!isBroken && m.url ? (
                  <div
                    onClick={() => setLightbox(m)}
                    className="overflow-hidden rounded-sm bg-muted/20 cursor-pointer"
                  >
                    <img
                      src={m.url}
                      alt={m.caption}
                      loading="lazy"
                      onError={() => {
                        console.warn("[Memories] Photo unavailable at storage path:", m.storagePath);
                        setBrokenImages((prev) => ({ ...prev, [m.id]: true }));
                      }}
                      className="w-full rounded-sm object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-sm bg-muted/30 border border-dashed border-input/60 text-center p-4">
                    <p className="font-serif text-xs text-muted-foreground italic">Photo unavailable</p>
                  </div>
                )}

                <figcaption className="px-1.5 pt-3.5 pb-1">
                  <p className="font-serif text-base leading-snug text-ink line-clamp-3">“{m.caption}”</p>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                    <p className="eyebrow text-gold/90 text-[0.65rem] font-medium tracking-[0.2em]">
                      {m.addedBy ? `— ${m.addedBy}` : "— Keepsake"}
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setMemoryToDelete(m);
                      }}
                      className="text-[0.65rem] tracking-[0.16em] uppercase text-muted-foreground/60 hover:text-destructive transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                      title="Remove memory"
                    >
                      Remove
                    </button>
                  </div>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="paper hairline mx-auto mt-14 max-w-md rounded-sm p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-gold text-lg">
            ✦
          </span>
          <h3 className="mt-4 font-serif text-2xl text-ink">Pages waiting to be filled</h3>
          <p className="mt-2 text-sm text-muted-foreground italic">
            Add the first memory to her scrapbook above.
          </p>
        </div>
      )}

      {/* Full Photo Lightbox Modal */}
      {lightbox?.url && !brokenImages[lightbox.id] && (
        <div
          role="presentation"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4 sm:p-6 backdrop-blur-xs animate-in fade-in-0 duration-200"
        >
          <article
            onClick={(e) => e.stopPropagation()}
            className="paper hairline relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm p-5 sm:p-7 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
              <span className="eyebrow text-[0.65rem]">Scrapbook Memory</span>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="text-sm tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="Close photo preview"
              >
                ✕
              </button>
            </div>

            <figure className="mt-2">
              <img
                src={lightbox.url}
                alt={lightbox.caption}
                className="max-h-[60vh] w-full rounded-sm object-contain bg-muted/10 border border-input/40"
              />
              <figcaption className="mt-5 border-t border-border/60 pt-4">
                <p className="font-serif text-xl leading-relaxed text-ink whitespace-pre-line">
                  “{lightbox.caption}”
                </p>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="eyebrow text-gold text-xs font-medium tracking-[0.24em]">
                    {lightbox.addedBy ? `— ${lightbox.addedBy}` : "— Keepsake"}
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setMemoryToDelete(lightbox);
                    }}
                    className="text-xs tracking-[0.18em] uppercase text-muted-foreground/70 hover:text-destructive transition-colors cursor-pointer"
                  >
                    Remove memory
                  </button>
                </div>
              </figcaption>
            </figure>
          </article>
        </div>
      )}

      {/* Direct Delete Confirmation Modal (NO PASSCODE) */}
      {memoryToDelete && (
        <div
          role="presentation"
          onClick={() => !deleteBusy && setMemoryToDelete(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs animate-in fade-in-0 duration-200"
        >
          <article
            onClick={(e) => e.stopPropagation()}
            className="paper hairline relative w-full max-w-sm rounded-sm p-6 text-center shadow-2xl"
          >
            <h3 className="font-serif text-2xl text-ink">Remove memory?</h3>
            <p className="mt-2 text-sm text-muted-foreground font-serif italic">
              “{memoryToDelete.caption}”
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This photo and note will be permanently removed from the scrapbook.
            </p>

            <form onSubmit={handleConfirmDelete} className="mt-5">
              {deleteError && (
                <p className="text-xs text-destructive font-sans font-medium mb-3">{deleteError}</p>
              )}

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMemoryToDelete(null)}
                  disabled={deleteBusy}
                  className="rounded-sm border border-input px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-colors hover:bg-accent cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="rounded-sm bg-destructive px-5 py-2 text-xs tracking-[0.2em] uppercase text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                >
                  {deleteBusy ? "Removing…" : "Remove"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}
    </section>
  );
}



