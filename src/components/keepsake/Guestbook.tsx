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
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent">("idle");

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
    if (modalMode !== "closed") {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [modalMode]);

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
    if (modalMode === "closed") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          handleCloseModal();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalMode, showDeleteConfirm]);

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
      setFormError("Please write a birthday message");
      return;
    }

    try {
      setFormStatus("sending");
      const res = await executeSubmit({
        data: {
          name,
          relationship: form.relationship.trim() || undefined,
          message,
        },
      });

      if (res?.ok && res?.letter) {
        setFormStatus("sent");
        setForm({ name: "", relationship: "", message: "" });
        setLetters((prev) => [res.letter as PublicLetter, ...prev]);
        await refreshLetters();

        setTimeout(() => {
          setFormStatus("idle");
        }, 5000);
      } else {
        throw new Error("Could not submit note");
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
        Write her a birthday note. Your message remains private — only she can open and read it.
      </p>

      {/* Guestbook Form */}
      <form onSubmit={onSubmit} className="paper hairline mx-auto mt-10 max-w-xl rounded-sm p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            className={field}
            placeholder="Your name"
            maxLength={60}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={field}
            placeholder="How you know her (optional)"
            maxLength={60}
            value={form.relationship}
            onChange={(e) => setForm({ ...form, relationship: e.target.value })}
          />
        </div>
        <textarea
          className={`${field} mt-4 min-h-32 resize-none leading-relaxed font-serif`}
          placeholder="Your birthday message…"
          maxLength={1000}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {formError ? (
              <span className="text-destructive">{formError}</span>
            ) : formStatus === "sent" ? (
              <span className="text-gold font-medium">
                Thank you — your letter has been sealed and left for her ✦
              </span>
            ) : (
              `${form.message.length}/1000 · Sealed with love`
            )}
          </p>
          <button
            type="submit"
            disabled={formStatus === "sending"}
            className={btn}
          >
            {formStatus === "sending" ? "Sealing…" : "Sign the book"}
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
              Be the first to sign the book and leave a private birthday letter above.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[3px] px-4 transition-all animate-in fade-in-0 duration-200">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[4px] p-4 sm:p-6 transition-all animate-in fade-in-0 duration-300">
          <div className="paper hairline relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-sm p-6 sm:p-10 shadow-2xl overflow-hidden transition-all duration-300 animate-in zoom-in-95 duration-200">
            {/* Top Close Button */}
            <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
              <div>
                <p className="eyebrow text-[0.65rem] tracking-[0.24em] text-gold uppercase">
                  LETTER FROM
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
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 font-serif text-lg sm:text-xl text-ink/90 leading-relaxed whitespace-pre-line my-4">
              <p className="italic text-ink font-serif">Dear Arohi,</p>
              <div className="pt-2">{activeLetter.message}</div>
              <p className="pt-4 font-serif italic text-gold">
                With love,
                <br />
                {activeLetter.name}
              </p>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-5">
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
                    This cannot be undone.
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
    </section>
  );
}
