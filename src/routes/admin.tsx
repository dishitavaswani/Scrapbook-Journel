import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAddLetter,
  adminAddOfflineEntries,
  adminDeleteEntry,
  adminDeleteMemory,
  adminListEntries,
  adminLogin,
  adminLogout,
  adminSetApproved,
  adminStatus,
} from "@/lib/admin.functions";
import { addMemory, listMemories } from "@/lib/memories.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Keepsake Admin — Prajakta at 35" },
      {
        name: "description",
        content:
          "Private admin area for the birthday keepsake: approve guestbook notes, add offline messages, and manage the photo gallery.",
      },
      { property: "og:title", content: "Keepsake Admin — Prajakta at 35" },
      {
        property: "og:description",
        content: "Moderate guestbook messages and photos for the birthday keepsake.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

type Entry = {
  id: string;
  name: string;
  relationship: string | null;
  message: string;
  photo_storage_path?: string | null;
  photoUrl?: string | null;
  approved: boolean;
  created_at: string;
};

type Memory = { id: string; caption: string; addedBy: string | null; url: string | null };

const field =
  "w-full rounded-sm border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold";
const btn =
  "rounded-sm bg-primary px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer";
const ghost =
  "rounded-sm border border-input px-5 py-2.5 text-xs tracking-[0.24em] uppercase text-foreground transition-colors hover:bg-accent cursor-pointer";

function Admin() {
  const status = useServerFn(adminStatus);
  const login = useServerFn(adminLogin);
  const logout = useServerFn(adminLogout);
  const listEntries = useServerFn(adminListEntries);
  const setApproved = useServerFn(adminSetApproved);
  const deleteEntry = useServerFn(adminDeleteEntry);
  const executeAddLetter = useServerFn(adminAddLetter);
  const addOffline = useServerFn(adminAddOfflineEntries);
  const deleteMemory = useServerFn(adminDeleteMemory);
  const fetchMemories = useServerFn(listMemories);
  const executeAddMemory = useServerFn(addMemory);

  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

  // Manual single letter entry state
  const [letterName, setLetterName] = useState("");
  const [letterRelationship, setLetterRelationship] = useState("");
  const [letterMessage, setLetterMessage] = useState("");
  const [letterPhotoFile, setLetterPhotoFile] = useState<File | null>(null);
  const [letterPhotoPreview, setLetterPhotoPreview] = useState<string | null>(null);
  const [letterBusy, setLetterBusy] = useState(false);
  const [letterNote, setLetterNote] = useState<string | null>(null);
  const letterFileInputRef = useRef<HTMLInputElement>(null);

  // Bulk offline importer state
  const [bulk, setBulk] = useState("");
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  // Admin memory photo upload state
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoAddedBy, setPhotoAddedBy] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [e, m] = await Promise.all([listEntries(), fetchMemories()]);
    setEntries(e as Entry[]);
    setMemories(m as Memory[]);
  }, [listEntries, fetchMemories]);

  useEffect(() => {
    void status()
      .then((res) => {
        const u = res?.unlocked === true;
        setUnlocked(u);
        if (u) void load();
      })
      .catch((err) => {
        console.warn("[Admin] Status check fallback:", err);
        setUnlocked(false);
      });
  }, [status, load]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(false);
    const { ok } = await login({ data: { password } });
    if (!ok) return setLoginError(true);
    setPassword("");
    setUnlocked(true);
    void load();
  }

  function handleLetterPhotoSelect(file: File | null) {
    if (!file) {
      setLetterPhotoFile(null);
      setLetterPhotoPreview(null);
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setLetterNote("Photo is too large (maximum 8 MB)");
      return;
    }

    setLetterPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLetterPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    setLetterNote(null);
  }

  function handleRemoveLetterPhoto() {
    setLetterPhotoFile(null);
    setLetterPhotoPreview(null);
    if (letterFileInputRef.current) letterFileInputRef.current.value = "";
  }

  async function onAddSingleLetter(e: FormEvent) {
    e.preventDefault();
    setLetterNote(null);

    const name = letterName.trim();
    const message = letterMessage.trim();
    if (!name) {
      setLetterNote("Please enter sender's name");
      return;
    }
    if (!message) {
      setLetterNote("Please enter the letter text");
      return;
    }
    if (message.length > 10000) {
      setLetterNote("Letter exceeds 10,000 character limit");
      return;
    }

    try {
      setLetterBusy(true);
      let photoBase64: string | undefined;

      if (letterPhotoFile) {
        photoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read photo"));
          reader.readAsDataURL(letterPhotoFile);
        });
      }

      await executeAddLetter({
        data: {
          name,
          relationship: letterRelationship.trim() || undefined,
          message,
          photoBase64,
          photoName: letterPhotoFile?.name,
        },
      });

      setLetterBusy(false);
      setLetterNote("Private letter added successfully ✦");
      setLetterName("");
      setLetterRelationship("");
      setLetterMessage("");
      handleRemoveLetterPhoto();
      void load();
    } catch (err: any) {
      setLetterBusy(false);
      setLetterNote(err?.message || "Failed to add letter");
    }
  }

  async function onBulk(e: FormEvent) {
    e.preventDefault();
    setBulkNote(null);
    const parsed = bulk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...rest] = line.split("|");
        return { name: (name ?? "").trim(), message: rest.join("|").trim() };
      })
      .filter((x) => x.name && x.message);
    if (parsed.length === 0) {
      setBulkNote("Use one message per line: Name | Their message");
      return;
    }
    try {
      const { count } = await addOffline({ data: { entries: parsed } });
      setBulkNote(`Added ${count} message${count === 1 ? "" : "s"}.`);
      setBulk("");
      void load();
    } catch {
      setBulkNote("Couldn't add those — check the format and length (up to 10,000 characters).");
    }
  }

  async function onUploadPhoto(e: FormEvent) {
    e.preventDefault();
    if (!photoFile) {
      setPhotoNote("Please select an image file");
      return;
    }
    if (!photoCaption.trim()) {
      setPhotoNote("Please enter a caption");
      return;
    }

    try {
      setPhotoBusy(true);
      setPhotoNote(null);

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read image"));
        reader.readAsDataURL(photoFile);
      });

      await executeAddMemory({
        data: {
          fileBase64: base64,
          fileName: photoFile.name,
          caption: photoCaption.trim(),
          addedBy: photoAddedBy.trim() || undefined,
        },
      });

      setPhotoBusy(false);
      setPhotoNote("Photo added successfully ✦");
      setPhotoCaption("");
      setPhotoAddedBy("");
      setPhotoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      void load();
    } catch (err: any) {
      setPhotoBusy(false);
      setPhotoNote(err?.message || "Failed to upload photo");
    }
  }

  if (unlocked === null) {
    return <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading…</main>;
  }

  if (!unlocked) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <form onSubmit={onLogin} className="paper hairline w-full max-w-sm rounded-sm p-8">
          <p className="eyebrow text-center">Private</p>
          <h1 className="mt-3 text-center font-serif text-2xl text-ink">Keepsake admin</h1>
          <input
            className={`${field} mt-6`}
            type="password"
            autoComplete="current-password"
            placeholder="Admin password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
          />
          {loginError && <p className="mt-3 text-xs text-destructive">Incorrect password</p>}
          <button type="submit" className={`${btn} mt-6 w-full`}>
            Unlock
          </button>
        </form>
      </main>
    );
  }

  const pending = entries.filter((e) => !e.approved);
  const approved = entries.filter((e) => e.approved);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl text-ink">Keepsake Admin</h1>
          <p className="mt-1 text-xs text-muted-foreground">Manage private letters, guestbook notes, memories, and scrapbook photos.</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className={ghost}>
            View Site
          </a>
          <button
            className={ghost}
            onClick={async () => {
              await logout();
              setUnlocked(false);
            }}
          >
            Lock
          </button>
        </div>
      </div>

      {/* Add Single Private Letter Form */}
      <section className="mt-12">
        <p className="eyebrow text-gold">Add Private Letter (Manual Entry)</p>
        <form onSubmit={onAddSingleLetter} className="paper hairline mt-4 rounded-sm p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Sender Name *</label>
              <input
                className={field}
                placeholder="e.g. Kuhu, Shaurya, Aditi…"
                maxLength={60}
                value={letterName}
                onChange={(e) => setLetterName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Relationship / How they know her (optional)</label>
              <input
                className={field}
                placeholder="e.g. Sister, Best Friend, Cousin…"
                maxLength={60}
                value={letterRelationship}
                onChange={(e) => setLetterRelationship(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-muted-foreground">Full Letter * (Up to 10,000 characters)</label>
              <span className={`text-xs ${letterMessage.length > 10000 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                {letterMessage.length} / 10000
              </span>
            </div>
            <textarea
              className={`${field} min-h-48 resize-y font-serif leading-relaxed text-sm`}
              placeholder={"Dear Praju,\n\nI wanted to write you this letter..."}
              maxLength={10000}
              value={letterMessage}
              onChange={(e) => setLetterMessage(e.target.value)}
            />
          </div>

          {/* Photo Attachment */}
          <div className="rounded-sm border border-border/60 bg-muted/10 p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Photo (Optional) · JPG, PNG, WEBP (Max 8 MB)
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <input
                ref={letterFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={(e) => handleLetterPhotoSelect(e.target.files?.[0] ?? null)}
                className="text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.16em] file:text-foreground cursor-pointer"
              />
              {letterPhotoPreview && (
                <div className="flex items-center gap-3">
                  <img
                    src={letterPhotoPreview}
                    alt="Preview"
                    className="h-16 w-16 rounded-sm object-cover border border-border shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveLetterPhoto}
                    className="text-xs uppercase tracking-[0.16em] text-destructive hover:underline cursor-pointer"
                  >
                    Remove Photo
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              {letterNote ? (
                <span className={letterNote.includes("success") ? "text-gold font-medium" : "text-destructive"}>
                  {letterNote}
                </span>
              ) : (
                "Letters added here are approved and sealed into the private keepsake."
              )}
            </p>
            <button type="submit" disabled={letterBusy} className={btn}>
              {letterBusy ? "Saving…" : "Add Private Letter"}
            </button>
          </div>
        </form>
      </section>

      {/* Guestbook Waiting Approval */}
      <section className="mt-14">
        <p className="eyebrow">Waiting for approval ({pending.length})</p>
        <div className="mt-4 space-y-4">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pending.map((e) => (
            <article key={e.id} className="paper hairline rounded-sm p-6 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-serif text-xl text-ink font-semibold">From {e.name}</h3>
                  {e.relationship && (
                    <p className="text-xs text-muted-foreground italic font-serif">{e.relationship}</p>
                  )}
                </div>
                <span className="text-[0.65rem] uppercase tracking-[0.2em] px-2 py-0.5 rounded-sm bg-muted/40 text-muted-foreground">
                  PENDING
                </span>
              </div>

              {e.photoUrl && (
                <div className="pt-2">
                  <img
                    src={e.photoUrl}
                    alt={`Attached by ${e.name}`}
                    className="max-h-48 max-w-xs rounded-sm object-cover border border-border shadow-sm"
                  />
                </div>
              )}

              <div className="font-serif text-base text-ink/90 leading-relaxed whitespace-pre-line py-2 border-y border-border/30">
                {e.message}
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-[0.7rem] text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    className={btn}
                    onClick={async () => {
                      await setApproved({ data: { id: e.id, approved: true } });
                      void load();
                    }}
                  >
                    Approve
                  </button>
                  <button
                    className={ghost}
                    onClick={async () => {
                      if (!confirm(`Delete letter from ${e.name}?`)) return;
                      await deleteEntry({ data: { id: e.id } });
                      void load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Approved Guestbook Messages & Letters */}
      <section className="mt-14">
        <p className="eyebrow">On the wall / Active Letters ({approved.length})</p>
        <div className="mt-4 space-y-3">
          {approved.length === 0 && <p className="text-sm text-muted-foreground">No approved letters.</p>}
          {approved.map((e) => (
            <div
              key={e.id}
              className="paper hairline rounded-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {e.photoUrl && (
                  <img
                    src={e.photoUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-sm object-cover border border-border"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-ink font-serif font-medium truncate">
                    <span>From {e.name}</span>
                    {e.relationship && <span className="text-xs text-muted-foreground ml-1.5 font-sans font-normal">({e.relationship})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-serif truncate max-w-md">
                    {e.message.slice(0, 100)}…
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-ink cursor-pointer px-2 py-1"
                  onClick={async () => {
                    await setApproved({ data: { id: e.id, approved: false } });
                    void load();
                  }}
                >
                  Hide
                </button>
                <button
                  className="text-xs uppercase tracking-[0.2em] text-destructive hover:underline cursor-pointer px-2 py-1"
                  onClick={async () => {
                    if (!confirm(`Delete letter from ${e.name}? This will remove both the message and attached photo.`)) return;
                    await deleteEntry({ data: { id: e.id } });
                    void load();
                  }}
                >
                  Delete ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upload Photo to Scrapbook Gallery */}
      <section className="mt-14">
        <p className="eyebrow">Add photo to memories gallery</p>
        <form onSubmit={onUploadPhoto} className="paper hairline mt-4 rounded-sm p-6 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Select Photo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:uppercase file:tracking-[0.16em] file:text-foreground cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Caption / Note</label>
              <input
                className={field}
                placeholder="A line about this photo…"
                maxLength={160}
                value={photoCaption}
                onChange={(e) => setPhotoCaption(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Contributor Name</label>
              <input
                className={field}
                placeholder="e.g. Dishita, Rohan…"
                maxLength={60}
                value={photoAddedBy}
                onChange={(e) => setPhotoAddedBy(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              {photoNote ?? "Photos uploaded here are immediately pinned to the scrapbook."}
            </p>
            <button type="submit" disabled={photoBusy} className={btn}>
              {photoBusy ? "Uploading…" : "Add Photo"}
            </button>
          </div>
        </form>
      </section>

      {/* Add Offline Bulk Guestbook Messages */}
      <section className="mt-14">
        <p className="eyebrow">Add messages collected offline (Bulk text importer)</p>
        <form onSubmit={onBulk} className="paper hairline mt-4 rounded-sm p-5">
          <textarea
            className={`${field} min-h-32 resize-none font-mono text-xs`}
            placeholder={"Aai | Happy birthday my darling girl\nRohan | Thirty-five looks good on you"}
            value={bulk}
            onChange={(ev) => setBulk(ev.target.value)}
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {bulkNote ?? "One per line — Name | Their message (up to 10,000 characters). These go up approved."}
            </p>
            <button type="submit" className={btn}>
              Add to the wall
            </button>
          </div>
        </form>
      </section>

      {/* Photo Gallery Management */}
      <section className="mt-14 mb-10">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Scrapbook Photos ({memories.length})</p>
          {memories.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Are you sure you want to delete ALL photos from the gallery?")) return;
                setMemories([]);
                try {
                  await supabase.from("memories").delete().neq("id", "00000000-0000-0000-0000-000000000000");
                } catch (err) {
                  console.warn("Direct purge error:", err);
                }
                for (const m of memories) {
                  try {
                    await deleteMemory({ data: { id: m.id } });
                  } catch {
                    // Ignore
                  }
                }
                void load();
              }}
              className="text-xs uppercase tracking-[0.2em] text-destructive hover:underline cursor-pointer"
            >
              Clear All Photos
            </button>
          )}
        </div>

        {memories.length === 0 ? (
          <div className="paper hairline mt-4 rounded-sm p-6 text-center text-xs text-muted-foreground italic">
            No photos in the scrapbook yet.
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {memories.map((m) => (
              <figure key={m.id} className="paper hairline rounded-sm p-3 flex flex-col justify-between">
                <div>
                  {m.url ? (
                    <img src={m.url} alt={m.caption} className="w-full h-36 rounded-sm object-cover bg-muted/20" />
                  ) : (
                    <div className="w-full h-36 rounded-sm bg-muted/30 flex items-center justify-center text-xs text-muted-foreground italic">
                      Photo unavailable
                    </div>
                  )}
                  <figcaption className="px-1 pt-2 text-xs text-ink font-serif line-clamp-2">“{m.caption}”</figcaption>
                  {m.addedBy && <p className="px-1 text-[0.65rem] text-muted-foreground">— {m.addedBy}</p>}
                </div>
                <div className="mt-3 pt-2 border-t border-border/40 flex justify-end">
                  <button
                    className="text-[0.65rem] uppercase tracking-[0.2em] text-destructive font-semibold hover:opacity-80 cursor-pointer"
                    onClick={async () => {
                      setMemories((prev) => prev.filter((item) => item.id !== m.id));
                      try {
                        await supabase.from("memories").delete().eq("id", m.id);
                      } catch (err) {
                        console.warn("[Admin] Direct Supabase delete note:", err);
                      }
                      try {
                        await deleteMemory({ data: { id: m.id } });
                      } catch (err) {
                        console.warn("[Admin] Server delete error:", err);
                      }
                      void load();
                    }}
                  >
                    Remove ✕
                  </button>
                </div>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
