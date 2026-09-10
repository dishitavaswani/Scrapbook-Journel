import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  deletePrivateLetter,
  listPublicLetters,
  submitLetter,
  unlockPrivateLetter,
} from "@/lib/letters.functions";

export const LETTER_PASSCODE = "AArohi2026"; // Secret passcode

export type PublicLetter = {
  id: string;
  name: string;
  relationship: string | null;
  createdAt: string;
};

export type FullLetter = {
  id: string;
  name: string;
  relationship: string | null;
  message: string;
  photoUrl?: string | null;
  createdAt: string;
};

const READ_STORAGE_KEY = "prajakta_read_letters";

const field =
  "w-full rounded-sm border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold font-sans";
const btn =
  "rounded-sm bg-primary px-6 py-3 text-xs tracking-[0.24em] uppercase text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer";
const ghost =
  "rounded-sm border border-input px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-foreground transition-colors hover:bg-accent cursor-pointer";

export function Guestbook() {
  const fetchPublicLetters = useServerFn(listPublicLetters);
  const executeSubmit = useServerFn(submitLetter);
  const executeUnlock = useServerFn(unlockPrivateLetter);
  const executeDelete = useServerFn(deletePrivateLetter);

  const [letters, setLetters] = useState<PublicLetter[]>([]);
  const [form, setForm] = useState({ name: "", relationship: "", message: "" });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent">("idle");
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Read status tracking
  const [readLetterIds, setReadLetterIds] = useState<Set<string>>(new Set());

  // Modal interaction state
  const [selectedLetter, setSelectedLetter] = useState<PublicLetter | null>(null);
  const [modalMode, setModalMode] = useState<"closed" | "passcode" | "reading">("closed");
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [activeLetter, setActiveLetter] = useState<FullLetter | null>(null);
  const [activePasscode, setActivePasscode] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  // Lightbox expanded photo modal
  const [lightboxPhotoUrl, setLightboxPhotoUrl] = useState<string | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load read letter IDs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(READ_STORAGE_KEY);
      if (stored) {
        setReadLetterIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // Ignore
    }
  }, []);

  const markLetterAsRead = useCallback((id: string) => {
    setReadLetterIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // Fetch public letters list
  const refreshLetters = useCallback(async () => {
    try {
      const data = await fetchPublicLetters();
      if (Array.isArray(data)) {
        setLetters(data as PublicLetter[]);
      }
    } catch (err) {
      console.warn("[Guestbook] Failed to load letters:", err);
    }
  }, [fetchPublicLetters]);

  useEffect(() => {
    void refreshLetters();
  }, [refreshLetters]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (modalMode !== "closed" || lightboxPhotoUrl !== null) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [modalMode, lightboxPhotoUrl]);

  // Focus passcode input
  useEffect(() => {
    if (modalMode === "passcode") {
      setPasscode("");
      setPasscodeError(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [modalMode]);

  // Escape key handler
  useEffect(() => {
    if (modalMode === "closed" && !lightboxPhotoUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (lightboxPhotoUrl) {
          setLightboxPhotoUrl(null);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          handleCloseModal();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalMode, showDeleteConfirm, lightboxPhotoUrl]);

  // Photo selection handler
  function handlePhotoSelect(file: File | null) {
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setFormError("Photo exceeds maximum size of 8 MB");
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setFormError("Please select a valid image (JPG, PNG, or WEBP)");
      return;
    }

    setFormError(null);
    setPhotoFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  }

  // Handle Form Submission
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    const message = form.message.trim();
    if (!name) {
      setFormError("Please add your name");
      return;
    }
    if (!message) {
      setFormError("Please write your letter");
      return;
    }
    if (message.length > 10000) {
      setFormError("Letter cannot exceed 10,000 characters");
      return;
    }

    try {
      setFormStatus("sending");

      let photoBase64: string | undefined;
      if (photoFile) {
        photoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read photo file"));
          reader.readAsDataURL(photoFile);
        });
      }

      const res = await executeSubmit({
        data: {
          name,
          relationship: form.relationship.trim() || undefined,
          message,
          photoBase64,
          photoName: photoFile?.name,
        },
      });

      if (res?.ok && res?.letter) {
        setFormStatus("sent");
        setForm({ name: "", relationship: "", message: "" });
        handleRemovePhoto();
        
        try {
          const latest = await fetchPublicLetters();
          if (Array.isArray(latest) && latest.length > 0) {
            setLetters(latest as PublicLetter[]);
          } else {
            setLetters((prev) => [
              res.letter as PublicLetter,
              ...prev.filter((l) => l.id !== res.letter.id),
            ]);
          }
        } catch {
          setLetters((prev) => [
            res.letter as PublicLetter,
            ...prev.filter((l) => l.id !== res.letter.id),
          ]);
        }

        setTimeout(() => {
          setFormStatus("idle");
        }, 6000);
      } else {
        throw new Error("Could not submit letter");
      }
    } catch (err: any) {
      setFormStatus("idle");
      setFormError(err?.message || "Something went wrong. Please try again.");
    }
  }

  // Open Passcode Modal for Letter
  function handleLetterClick(letter: PublicLetter) {
    setSelectedLetter(letter);
    setModalMode("passcode");
  }

  // Close Modal
  function handleCloseModal() {
    setModalMode("closed");
    setSelectedLetter(null);
    setActiveLetter(null);
    setActivePasscode(null);
    setPasscode("");
    setPasscodeError(null);
    setShowDeleteConfirm(false);
    setLightboxPhotoUrl(null);
  }

  // Submit Passcode to Unlock Letter
  async function handlePasscodeSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedLetter) return;
    const cleanPass = passcode.trim();
    if (!cleanPass) return;

    try {
      setUnlockBusy(true);
      setPasscodeError(null);

      const res = await executeUnlock({
        data: {
          id: selectedLetter.id,
          passcode: cleanPass,
        },
      });

      if (res?.ok && res?.letter) {
        setActiveLetter(res.letter as FullLetter);
        setActivePasscode(cleanPass);
        markLetterAsRead(selectedLetter.id);
        setModalMode("reading");
      } else {
        throw new Error("Incorrect passcode");
      }
    } catch (err: any) {
      setIsShaking(true);
      setPasscodeError(err?.message || "Incorrect passcode. Try again.");
      setTimeout(() => setIsShaking(false), 500);
    } finally {
      setUnlockBusy(false);
    }
  }

  // Delete Letter
  async function handleConfirmDelete() {
    if (!activeLetter || !activePasscode || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await executeDelete({
        data: {
          id: activeLetter.id,
          passcode: activePasscode,
        },
      });

      setLetters((prev) => prev.filter((l) => l.id !== activeLetter.id));
      handleCloseModal();
    } catch (err) {
      console.error("[Guestbook] Failed to delete letter:", err);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <p className="eyebrow text-center">Leave something behind</p>
      <h2 className="mt-3 text-center text-3xl text-ink">Letters left for her ✦</h2>
      <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
        Write her a personal letter or birthday note. Your words and photos remain private — only she can open and read them.
      </p>

      {/* Guestbook / Private Letter Form */}
      <form onSubmit={onSubmit} className="paper hairline mx-auto mt-10 max-w-xl rounded-sm p-7 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">NAME *</label>
            <input
              className={field}
              placeholder="Your name"
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">HOW YOU KNOW HER (OPTIONAL)</label>
            <input
              className={field}
              placeholder="Sister / Friend / Colleague…"
              maxLength={60}
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-muted-foreground">YOUR LETTER *</label>
            <span
              className={`text-xs font-mono ${
                form.message.length > 10000 ? "text-destructive font-semibold" : "text-muted-foreground"
              }`}
            >
              {form.message.length} / 10000
            </span>
          </div>
          <textarea
            className={`${field} min-h-56 resize-y leading-relaxed font-serif text-base`}
            placeholder={"Dear Praju,\n\nI wanted to write you this letter on your thirty-fifth birthday..."}
            maxLength={10000}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>

        {/* Photo Upload Section */}
        <div className="rounded-sm border border-border/60 bg-muted/10 p-4">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              PHOTO (OPTIONAL)
            </label>
            <span className="text-[0.65rem] text-muted-foreground">JPG, PNG, WEBP · Max 8 MB</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="cursor-pointer inline-flex items-center gap-2 rounded-sm border border-input bg-background px-4 py-2 text-xs uppercase tracking-[0.16em] text-foreground transition-colors hover:bg-accent">
              <span>CHOOSE PHOTO</span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>

            {photoPreview && (
              <div className="flex items-center gap-3 animate-in fade-in-0 duration-200">
                <img
                  src={photoPreview}
                  alt="Selected preview"
                  className="h-14 w-14 rounded-sm object-cover border border-gold/40 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="text-xs uppercase tracking-[0.16em] text-destructive hover:underline cursor-pointer"
                >
                  REMOVE PHOTO
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status / Submit Row */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            {formError ? (
              <span className="text-destructive font-medium">{formError}</span>
            ) : formStatus === "sent" ? (
              <span className="text-gold font-medium">
                Thank you — your letter has been sealed and left for her ✦
              </span>
            ) : (
              "Sealed with love · Private to Praju"
            )}
          </p>
          <button
            type="submit"
            disabled={formStatus === "sending"}
            className={btn}
          >
            {formStatus === "sending" ? "Sealing Letter…" : "ADD LETTER"}
          </button>
        </div>
      </form>

      {/* Private Letters Waiting Grid */}
      <div className="mt-16">
        <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-8">
          <p className="eyebrow text-xs text-gold">Letters waiting for her ✦</p>
          <p className="text-xs text-muted-foreground font-serif">
            {letters.length > 0
              ? `${letters.length} letter${letters.length === 1 ? "" : "s"} waiting`
              : "Empty"}
          </p>
        </div>

        {letters.length === 0 ? (
          <div className="py-12 text-center paper hairline rounded-sm bg-muted/20 p-8">
            <p className="font-serif text-lg italic text-ink/75">
              “No letters yet.”
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Be the first to leave a private birthday letter for Praju above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {letters.map((letter) => {
              const isRead = readLetterIds.has(letter.id);
              return (
                <div
                  key={letter.id}
                  onClick={() => handleLetterClick(letter)}
                  className="group paper hairline cursor-pointer rounded-sm p-6 text-center transition-all duration-300 hover:shadow-md hover:border-gold/60 flex flex-col justify-between"
                >
                  {/* Top Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-lg text-gold group-hover:scale-110 transition-transform">
                      ✉
                    </span>
                    <span
                      className={`text-[0.62rem] uppercase tracking-[0.2em] px-2 py-0.5 rounded-sm font-semibold ${
                        isRead
                          ? "bg-muted/40 text-muted-foreground"
                          : "bg-gold/15 text-gold border border-gold/30"
                      }`}
                    >
                      {isRead ? "READ" : "NEW"}
                    </span>
                  </div>

                  {/* Sender info */}
                  <div className="py-6">
                    <h3 className="font-serif text-xl sm:text-2xl text-ink group-hover:text-gold transition-colors">
                      From {letter.name}
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground font-serif italic">
                      {letter.relationship
                        ? `${letter.relationship} · A letter is waiting for you.`
                        : "A letter is waiting for you."}
                    </p>
                  </div>

                  {/* Tap prompt */}
                  <div className="border-t border-border/40 pt-3 flex items-center justify-center">
                    <span className="text-[0.68rem] uppercase tracking-[0.2em] text-gold font-serif font-semibold group-hover:underline">
                      TAP TO OPEN →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 1. PASSCODE MODAL — PRIVATE LETTER ACCESS                           */}
      {/* =================================================================== */}
      {modalMode === "passcode" && selectedLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[4px] px-4 transition-all animate-in fade-in-0 duration-200">
          <div
            className={`paper hairline w-full max-w-sm rounded-sm p-8 shadow-2xl transition-all duration-300 ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="eyebrow text-[0.65rem] tracking-[0.24em] text-gold">PRIVATE LETTER</p>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <h3 className="mt-2 font-serif text-2xl text-ink">
              A letter from {selectedLetter.name}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              “This letter was left especially for you.” Enter the private passcode to read it.
            </p>

            <form onSubmit={handlePasscodeSubmit} className="mt-6">
              <input
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                placeholder="Secret passcode"
                className={field}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />

              {passcodeError && (
                <p className="mt-2 text-xs text-destructive">{passcodeError}</p>
              )}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={`${ghost} flex-1`}
                >
                  CANCEL
                </button>
                <button type="submit" disabled={unlockBusy} className={`${btn} flex-1`}>
                  {unlockBusy ? "Opening…" : "OPEN LETTER"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. FULL LETTER READING MODAL (AFTER CORRECT PASSCODE)               */}
      {/* =================================================================== */}
      {modalMode === "reading" && activeLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[4px] p-4 sm:p-6 transition-all animate-in fade-in-0 duration-300">
          <div className="paper hairline relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-sm p-6 sm:p-10 shadow-2xl overflow-hidden transition-all duration-300 animate-in zoom-in-95 duration-200">
            {/* Top Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-4">
              <div>
                <p className="eyebrow text-[0.65rem] tracking-[0.24em] text-gold uppercase">
                  FROM {activeLetter.name.toUpperCase()}
                </p>
                <h3 className="font-serif text-2xl sm:text-3xl text-ink">
                  {activeLetter.name}
                  {activeLetter.relationship ? (
                    <span className="text-xs text-muted-foreground font-sans font-normal ml-2">
                      · {activeLetter.relationship}
                    </span>
                  ) : null}
                </h3>
              </div>

              <button
                type="button"
                onClick={handleCloseModal}
                className="text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground hover:text-ink cursor-pointer transition-colors p-1"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Letter Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6 my-2">
              {/* Attached Photo Display */}
              {activeLetter.photoUrl && (
                <div className="pt-2 pb-4 text-center">
                  <img
                    src={activeLetter.photoUrl}
                    alt={`Photo from ${activeLetter.name}`}
                    onClick={() => setLightboxPhotoUrl(activeLetter.photoUrl ?? null)}
                    className="max-h-80 w-auto max-w-full mx-auto rounded-sm object-contain border border-border/60 shadow-md cursor-zoom-in hover:opacity-95 transition-opacity"
                  />
                  <p className="mt-1.5 text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground italic font-sans">
                    Click photo to view full size
                  </p>
                </div>
              )}

              {/* Letter Greeting & Paragraphs */}
              <div className="space-y-4 font-serif text-lg sm:text-xl text-ink/90 leading-relaxed whitespace-pre-line">
                <p className="italic text-ink font-serif text-xl sm:text-2xl">Dear Praju,</p>
                <div className="pt-2 leading-relaxed">{activeLetter.message}</div>
                <p className="pt-6 font-serif italic text-gold text-xl">
                  With love,
                  <br />
                  {activeLetter.name}
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-4">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
              >
                REMOVE LETTER
              </button>

              <button
                type="button"
                onClick={handleCloseModal}
                className={btn}
              >
                CLOSE
              </button>
            </div>

            {/* Nested Delete Confirmation */}
            {showDeleteConfirm && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 animate-in fade-in-0 duration-150">
                <div className="paper hairline w-full max-w-sm rounded-sm p-6 shadow-2xl">
                  <p className="eyebrow text-destructive text-[0.65rem]">CONFIRM</p>
                  <h4 className="mt-1 font-serif text-xl text-ink">Remove this letter?</h4>
                  <p className="mt-2 text-xs text-muted-foreground">
                    This will permanently delete this letter and its attached photograph. This cannot be undone.
                  </p>

                  <div className="mt-6 flex justify-end gap-3 border-t border-border/40 pt-4">
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => setShowDeleteConfirm(false)}
                      className={ghost}
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={handleConfirmDelete}
                      className="rounded-sm bg-destructive px-5 py-2 text-xs tracking-[0.2em] uppercase text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                    >
                      {deleteBusy ? "Removing…" : "REMOVE"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Full Photo Modal */}
      {lightboxPhotoUrl && (
        <div
          onClick={() => setLightboxPhotoUrl(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 cursor-zoom-out animate-in fade-in-0 duration-200"
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={lightboxPhotoUrl}
              alt="Enlarged view"
              className="max-h-[85vh] max-w-full rounded-sm object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setLightboxPhotoUrl(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-xs uppercase tracking-[0.2em] p-2"
            >
              ✕ CLOSE
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
