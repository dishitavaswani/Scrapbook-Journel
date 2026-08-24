import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
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
  const addOffline = useServerFn(adminAddOfflineEntries);
  const deleteMemory = useServerFn(adminDeleteMemory);
  const fetchMemories = useServerFn(listMemories);
  const executeAddMemory = useServerFn(addMemory);

  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [bulk, setBulk] = useState("");
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  // Admin photo upload state
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
      setBulkNote("Couldn't add those — check the format and length.");
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
          <p className="mt-1 text-xs text-muted-foreground">Manage guestbook notes, memories, and scrapbook photos.</p>
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

      {/* Guestbook Waiting Approval */}
      <section className="mt-12">
        <p className="eyebrow">Waiting for approval ({pending.length})</p>
        <div className="mt-4 space-y-3">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
          {pending.map((e) => (
            <article key={e.id} className="paper hairline rounded-sm p-5">
              <p className="font-serif text-lg text-ink">“{e.message}”</p>
              <p className="mt-2 eyebrow">
                {e.name}
                {e.relationship ? ` · ${e.relationship}` : ""}
              </p>
              <div className="mt-4 flex gap-2">
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
                    await deleteEntry({ data: { id: e.id } });
                    void load();
                  }}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Upload Photo to Scrapbook */}
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

      {/* Add Offline Guestbook Messages */}
      <section className="mt-14">
        <p className="eyebrow">Add messages collected offline</p>
        <form onSubmit={onBulk} className="paper hairline mt-4 rounded-sm p-5">
          <textarea
            className={`${field} min-h-32 resize-none font-mono text-xs`}
            placeholder={"Aai | Happy birthday my darling girl\nRohan | Thirty-five looks good on you"}
            value={bulk}
            onChange={(ev) => setBulk(ev.target.value)}
          />
          <div className="mt-4 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {bulkNote ?? "One per line — Name | Their message. These go up approved."}
            </p>
            <button type="submit" className={btn}>
              Add to the wall
            </button>
          </div>
        </form>
      </section>

      {/* Approved Guestbook Messages */}
      <section className="mt-14">
        <p className="eyebrow">On the wall ({approved.length})</p>
        <div className="mt-4 space-y-2">
          {approved.map((e) => (
            <div
              key={e.id}
              className="hairline flex items-center justify-between gap-4 rounded-sm px-4 py-3"
            >
              <p className="truncate text-sm text-ink">
                <span className="text-muted-foreground">{e.name}:</span> {e.message}
              </p>
              <button
                className="shrink-0 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={async () => {
                  await setApproved({ data: { id: e.id, approved: false } });
                  void load();
                }}
              >
                Hide
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery Management */}
      <section className="mt-14 mb-10">
        <p className="eyebrow">Scrapbook Photos ({memories.length})</p>
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
                  className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={async () => {
                    setMemories((prev) => prev.filter((item) => item.id !== m.id));
                    try {
                      await deleteMemory({ data: { id: m.id } });
                    } catch (err) {
                      console.error("[Admin] Delete memory error:", err);
                    }
                    void load();
                  }}
                >
                  Remove
                </button>
              </div>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

