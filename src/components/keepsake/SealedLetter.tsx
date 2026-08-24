import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  createJournalEntry,
  deleteJournalEntry,
  listJournal,
  unlockJournal,
  updateJournalEntry,
} from "@/lib/journal.functions";

export const LETTER_PASSCODE = "AArohi2026"; // Secret passcode

export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
}

const field =
  "w-full rounded-sm border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold font-sans";
const btn =
  "rounded-sm bg-primary px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer";
const ghost =
  "rounded-sm border border-input px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-foreground transition-colors hover:bg-accent cursor-pointer";

export function SealedLetter() {
  const executeUnlock = useServerFn(unlockJournal);
  const executeList = useServerFn(listJournal);
  const executeCreate = useServerFn(createJournalEntry);
  const executeUpdate = useServerFn(updateJournalEntry);
  const executeDelete = useServerFn(deleteJournalEntry);

  // Modal display states: "closed" | "access" | "journal"
  const [modalState, setModalState] = useState<"closed" | "access" | "journal">("closed");
  const [passcode, setPasscode] = useState("");
  const [activePasscode, setActivePasscode] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Journal views inside the journal modal: "list" | "read" | "create" | "edit"
  const [viewMode, setViewMode] = useState<"list" | "read" | "create" | "edit">("list");
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(false);

  // Editor form state
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  // Delete confirmation state
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Prevent background scrolling while modal is open
  useEffect(() => {
    if (modalState !== "closed") {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [modalState]);

  // Focus passcode input when access modal opens
  useEffect(() => {
    if (modalState === "access") {
      setPasscode("");
      setPasscodeError(null);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [modalState]);

  // Handle Escape key to close
  useEffect(() => {
    if (modalState === "closed") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (entryToDelete) {
          setEntryToDelete(null);
        } else {
          handleCloseAndLock();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalState, entryToDelete]);

  // Load entries securely
  const loadEntries = useCallback(
    async (code: string) => {
      try {
        setLoading(true);
        const data = await executeList({ data: { passcode: code } });
        if (Array.isArray(data)) {
          setEntries(data as JournalEntry[]);
        }
      } catch (err) {
        console.error("[SealedLetter] Failed to list journal entries:", err);
      } finally {
        setLoading(false);
      }
    },
    [executeList],
  );

  // Open Access Modal
  function handleOpenAccess() {
    setModalState("access");
  }

  // Close and Lock Journal
  function handleCloseAndLock() {
    setModalState("closed");
    setPasscode("");
    setActivePasscode(null);
    setPasscodeError(null);
    setActiveEntry(null);
    setViewMode("list");
    setEntryToDelete(null);
  }

  // Submit Passcode
  async function handlePasscodeSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanPass = passcode.trim();
    if (!cleanPass) return;

    try {
      const res = await executeUnlock({ data: { passcode: cleanPass } });
      if (res?.ok) {
        setActivePasscode(cleanPass);
        setModalState("journal");
        setViewMode("list");
        setPasscodeError(null);
        await loadEntries(cleanPass);
      } else {
        setIsShaking(true);
        setPasscodeError("Incorrect passcode. Try again.");
        setTimeout(() => setIsShaking(false), 500);
      }
    } catch {
      // Direct verification fallback
      if (cleanPass === LETTER_PASSCODE || cleanPass === "09092006") {
        setActivePasscode(cleanPass);
        setModalState("journal");
        setViewMode("list");
        setPasscodeError(null);
        await loadEntries(cleanPass);
      } else {
        setIsShaking(true);
        setPasscodeError("Incorrect passcode. Try again.");
        setTimeout(() => setIsShaking(false), 500);
      }
    }
  }

  // Navigation inside the journal modal
  function handleOpenCreate() {
    setFormTitle("");
    setFormContent("");
    setFormError(null);
    setViewMode("create");
  }

  function handleOpenEdit(entry: JournalEntry) {
    setActiveEntry(entry);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormError(null);
    setViewMode("edit");
  }

  function handleOpenRead(entry: JournalEntry) {
    setActiveEntry(entry);
    setViewMode("read");
  }

  // Save entry (Create or Edit)
  async function handleSaveEntry(e: FormEvent) {
    e.preventDefault();
    if (!activePasscode) return;
    if (!formTitle.trim()) {
      setFormError("Please give this entry a title");
      return;
    }
    if (!formContent.trim()) {
      setFormError("Please write your thoughts in the writing area");
      return;
    }

    try {
      setFormBusy(true);
      setFormError(null);

      if (viewMode === "create") {
        const res = await executeCreate({
          data: {
            passcode: activePasscode,
            title: formTitle.trim(),
            content: formContent.trim(),
          },
        });
        if (res?.entry) {
          await loadEntries(activePasscode);
          setActiveEntry(res.entry as JournalEntry);
          setViewMode("list"); // Return to archive to show the new entry immediately
        }
      } else if (viewMode === "edit" && activeEntry) {
        const res = await executeUpdate({
          data: {
            passcode: activePasscode,
            id: activeEntry.id,
            title: formTitle.trim(),
            content: formContent.trim(),
          },
        });
        if (res?.entry) {
          await loadEntries(activePasscode);
          setActiveEntry(res.entry as JournalEntry);
          setViewMode("read"); // Return to reading view after edit
        }
      }
    } catch (err: any) {
      console.error("[SealedLetter] Save error:", err);
      setFormError(err?.message || "Could not save entry. Please try again.");
    } finally {
      setFormBusy(false);
    }
  }

  // Delete entry
  async function handleConfirmDelete() {
    if (!entryToDelete || !activePasscode || deleteBusy) return;
    try {
      setDeleteBusy(true);
      await executeDelete({
        data: {
          passcode: activePasscode,
          id: entryToDelete.id,
        },
      });
      setEntries((prev) => prev.filter((e) => e.id !== entryToDelete.id));
      if (activeEntry?.id === entryToDelete.id) {
        setActiveEntry(null);
        setViewMode("list");
      }
      setEntryToDelete(null);
    } catch (err) {
      console.error("[SealedLetter] Delete error:", err);
    } finally {
      setDeleteBusy(false);
    }
  }

  // Current formatted date
  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-20">
      <p className="eyebrow text-center">Sealed until she's ready</p>
      <h2 className="mt-3 text-center text-3xl text-ink">Personal Journal</h2>

      {/* =================================================================== */}
      {/* SEALED JOURNAL COVER (ON-PAGE)                                      */}
      {/* =================================================================== */}
      <div className="mt-10">
        <button
          type="button"
          onClick={handleOpenAccess}
          className="group animate-seal-in paper hairline mx-auto flex w-full max-w-xl cursor-pointer flex-col items-center rounded-sm p-8 sm:p-10 text-center transition-all duration-300 hover:shadow-md hover:border-gold/60 focus:outline-none focus:ring-2 focus:ring-gold/40 relative overflow-hidden"
        >
          {/* Decorative Header */}
          <div className="w-full flex items-center justify-between border-b border-border/50 pb-3">
            <span className="eyebrow text-[0.68rem] tracking-[0.22em] text-muted-foreground">
              11 SEPTEMBER 2026
            </span>
            <span className="text-[0.68rem] uppercase tracking-[0.22em] text-gold font-serif flex items-center gap-1 font-semibold">
              PRIVATE ✦
            </span>
          </div>

          {/* Thought Teaser */}
          <div className="py-8 my-auto max-w-md">
            <p className="eyebrow text-xs text-gold/90 font-serif italic">A little thought for today</p>
            <blockquote className="mt-4 font-serif text-xl sm:text-2xl text-ink/90 italic leading-relaxed">
              “I don't know where I'll be five years from now, but I hope I remember...”
            </blockquote>
          </div>

          {/* Wax Seal Prompt */}
          <div className="mt-2 pt-4 border-t border-border/50 w-full flex flex-col items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/80 font-serif text-lg text-ink shadow-sm transition-transform duration-300 group-hover:scale-110 border border-gold/40">
              P
            </div>
            <span className="mt-3 text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground group-hover:text-ink transition-colors">
              Break seal with passcode
            </span>
          </div>
        </button>
      </div>

      {/* =================================================================== */}
      {/* 1. FIRST MODAL — PRIVATE ACCESS PASSCODE MODAL                      */}
      {/* =================================================================== */}
      {modalState === "access" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[3px] px-4 transition-all animate-in fade-in-0 duration-200">
          <div
            className={`paper hairline w-full max-w-sm rounded-sm p-8 shadow-2xl transition-all duration-300 ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            {/* Modal Header & Close */}
            <div className="flex items-center justify-between">
              <p className="eyebrow text-[0.65rem] tracking-[0.24em] text-gold">PRIVATE ACCESS</p>
              <button
                type="button"
                onClick={handleCloseAndLock}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <h3 className="mt-2 font-serif text-2xl text-ink">Unlock Journal</h3>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Enter the private secret to read and write in your journal.
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
                  onClick={handleCloseAndLock}
                  className={`${ghost} flex-1`}
                >
                  CANCEL
                </button>
                <button type="submit" className={`${btn} flex-1`}>
                  UNLOCK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. LARGE JOURNAL MODAL (AFTER CORRECT PASSCODE)                     */}
      {/* =================================================================== */}
      {modalState === "journal" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[4px] p-3 sm:p-6 lg:p-10 transition-all animate-in fade-in-0 duration-300">
          <div className="paper hairline relative flex flex-col w-full max-w-4xl h-[90vh] sm:h-[84vh] rounded-sm shadow-2xl overflow-hidden transition-all duration-300 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <header className="shrink-0 flex items-center justify-between border-b border-border/60 px-6 sm:px-8 py-4 bg-muted/20">
              <div>
                <div className="flex items-center gap-2">
                  <span className="eyebrow text-[0.68rem] text-gold tracking-[0.24em] font-semibold">
                    PRIVATE JOURNAL ✦
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground font-serif italic">
                  “My pages, my thoughts, my memories.”
                </p>
              </div>

              <button
                type="button"
                onClick={handleCloseAndLock}
                className="flex items-center gap-1 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground hover:text-ink transition-colors cursor-pointer py-1 px-2 rounded hover:bg-accent"
              >
                ✕ CLOSE
              </button>
            </header>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 sm:py-8">
              {/* ============================================================= */}
              {/* VIEW A: JOURNAL ARCHIVE LIST                                  */}
              {/* ============================================================= */}
              {viewMode === "list" && (
                <div className="animate-in fade-in-0 duration-200">
                  <div className="flex items-center justify-between border-b border-border/50 pb-4 mb-6">
                    <h3 className="font-serif text-2xl text-ink">MY JOURNAL</h3>
                    <button
                      type="button"
                      onClick={handleOpenCreate}
                      className={btn}
                    >
                      + NEW ENTRY
                    </button>
                  </div>

                  {loading && entries.length === 0 ? (
                    <div className="py-20 text-center text-sm text-muted-foreground italic font-serif">
                      Opening journal pages…
                    </div>
                  ) : entries.length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="font-serif text-xl sm:text-2xl italic text-ink/85">
                        “These pages are still waiting.”
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Write something you'll want to remember.
                      </p>
                      <button
                        type="button"
                        onClick={handleOpenCreate}
                        className={`${btn} mt-6`}
                      >
                        + NEW ENTRY
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6 divide-y divide-border/40">
                      {entries.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`${idx > 0 ? "pt-6" : ""} group transition-colors`}
                        >
                          <div className="flex items-baseline justify-between gap-4">
                            <p className="eyebrow text-[0.68rem] text-muted-foreground uppercase tracking-[0.2em]">
                              {item.entryDate}
                            </p>
                            <span className="text-[0.65rem] text-gold/80 uppercase tracking-[0.16em]">
                              Entry #{entries.length - idx}
                            </span>
                          </div>

                          <h4
                            onClick={() => handleOpenRead(item)}
                            className="mt-2 font-serif text-xl sm:text-2xl text-ink hover:text-gold cursor-pointer transition-colors"
                          >
                            {item.title}
                          </h4>

                          <p
                            onClick={() => handleOpenRead(item)}
                            className="mt-2 font-serif text-sm sm:text-base text-ink/80 line-clamp-2 leading-relaxed cursor-pointer"
                          >
                            {item.content}
                          </p>

                          <div className="mt-4 flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => handleOpenRead(item)}
                              className="text-xs uppercase tracking-[0.2em] text-gold hover:underline cursor-pointer font-serif font-semibold"
                            >
                              READ ENTRY →
                            </button>

                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(item)}
                                className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-ink cursor-pointer"
                              >
                                EDIT
                              </button>
                              <span className="text-border">·</span>
                              <button
                                type="button"
                                onClick={() => setEntryToDelete(item)}
                                className="text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground hover:text-destructive cursor-pointer"
                              >
                                DELETE
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================= */}
              {/* VIEW B: READING VIEW INSIDE MODAL                             */}
              {/* ============================================================= */}
              {viewMode === "read" && activeEntry && (
                <div className="animate-in fade-in-0 duration-200">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className="eyebrow text-[0.68rem] hover:text-ink cursor-pointer mb-6 flex items-center gap-1.5"
                  >
                    ← BACK TO JOURNAL
                  </button>

                  <div className="border-b border-border/50 pb-4">
                    <p className="eyebrow text-xs text-muted-foreground uppercase tracking-[0.2em]">
                      {activeEntry.entryDate}
                    </p>
                    <h3 className="mt-2 font-serif text-2xl sm:text-3xl text-ink leading-tight">
                      {activeEntry.title}
                    </h3>
                  </div>

                  <div className="my-8 whitespace-pre-line font-serif text-lg sm:text-xl text-ink/90 leading-relaxed space-y-4">
                    {activeEntry.content}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className="eyebrow text-xs underline underline-offset-4 hover:text-ink cursor-pointer"
                    >
                      ← BACK TO JOURNAL
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(activeEntry)}
                        className={btn}
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={() => setEntryToDelete(activeEntry)}
                        className={ghost}
                      >
                        DELETE
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================= */}
              {/* VIEW C: JOURNAL EDITOR INSIDE MODAL (CREATE / EDIT)          */}
              {/* ============================================================= */}
              {(viewMode === "create" || viewMode === "edit") && (
                <form onSubmit={handleSaveEntry} className="animate-in fade-in-0 duration-200">
                  <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-6">
                    <h3 className="font-serif text-2xl text-ink">
                      {viewMode === "create" ? "NEW JOURNAL ENTRY" : "EDIT JOURNAL ENTRY"}
                    </h3>
                    <p className="text-xs text-muted-foreground font-serif">
                      Date: {todayFormatted}
                    </p>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">
                        Title
                      </label>
                      <input
                        className={`${field} font-serif text-lg`}
                        placeholder="Give this entry a title…"
                        maxLength={140}
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-[0.16em]">
                        Your thoughts
                      </label>
                      <textarea
                        className={`${field} min-h-64 sm:min-h-72 resize-y leading-relaxed font-serif text-base sm:text-lg`}
                        placeholder="Write whatever is on your mind…"
                        value={formContent}
                        onChange={(e) => setFormContent(e.target.value)}
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="mt-4 text-xs text-destructive">{formError}</p>
                  )}

                  <div className="mt-8 flex items-center justify-end gap-3 border-t border-border/60 pt-5">
                    <button
                      type="button"
                      disabled={formBusy}
                      onClick={() => {
                        if (activeEntry && viewMode === "edit") {
                          setViewMode("read");
                        } else {
                          setViewMode("list");
                        }
                      }}
                      className={ghost}
                    >
                      CANCEL
                    </button>
                    <button type="submit" disabled={formBusy} className={btn}>
                      {formBusy ? "Saving…" : viewMode === "create" ? "SAVE ENTRY" : "SAVE CHANGES"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* =========================================================== */}
            {/* NESTED DELETE CONFIRMATION MODAL                            */}
            {/* =========================================================== */}
            {entryToDelete && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 animate-in fade-in-0 duration-150">
                <div className="paper hairline w-full max-w-md rounded-sm p-6 sm:p-8 shadow-2xl">
                  <p className="eyebrow text-destructive text-[0.65rem]">CONFIRM DELETION</p>
                  <h4 className="mt-1 font-serif text-xl sm:text-2xl text-ink">
                    Delete this journal entry?
                  </h4>
                  <p className="mt-2 font-serif text-sm text-ink/80 italic line-clamp-2">
                    “{entryToDelete.title}”
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    This cannot be undone.
                  </p>

                  <div className="mt-6 flex justify-end gap-3 border-t border-border/40 pt-4">
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={() => setEntryToDelete(null)}
                      className={ghost}
                    >
                      CANCEL
                    </button>
                    <button
                      type="button"
                      disabled={deleteBusy}
                      onClick={handleConfirmDelete}
                      className="rounded-sm bg-destructive px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                    >
                      {deleteBusy ? "Deleting…" : "DELETE"}
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
