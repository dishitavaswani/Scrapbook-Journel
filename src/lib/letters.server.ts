import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/integrations/supabase/client";
import { verifyJournalPasscode } from "./journal.server";

const LETTERS_DIR = path.resolve("public/letters");
const LETTERS_PHOTOS_DIR = path.resolve("public/letters/photos");
const LETTERS_JSON = path.join(LETTERS_DIR, "letters.json");
const DELETED_LETTERS_JSON = path.join(LETTERS_DIR, "deleted.json");

export type StoredLetter = {
  id: string;
  name: string;
  relationship: string | null;
  message: string;
  photoStoragePath?: string | null;
  approved: boolean;
  createdAt: string;
};

export function ensureLettersStore() {
  if (!fs.existsSync(LETTERS_DIR)) {
    fs.mkdirSync(LETTERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LETTERS_PHOTOS_DIR)) {
    fs.mkdirSync(LETTERS_PHOTOS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LETTERS_JSON)) {
    fs.writeFileSync(LETTERS_JSON, "[]", "utf8");
  }
  if (!fs.existsSync(DELETED_LETTERS_JSON)) {
    fs.writeFileSync(DELETED_LETTERS_JSON, "[]", "utf8");
  }
}

export function saveLocalLetterPhoto(filename: string, base64Data: string) {
  try {
    ensureLettersStore();
    const filePath = path.join(LETTERS_PHOTOS_DIR, filename);
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    fs.writeFileSync(filePath, buffer);
    return buffer;
  } catch (err) {
    console.error("[saveLocalLetterPhoto] Error saving local letter photo:", err);
    return null;
  }
}

export function deleteLocalLetterPhoto(filename: string) {
  try {
    ensureLettersStore();
    const filePath = path.join(LETTERS_PHOTOS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn("[deleteLocalLetterPhoto] Error deleting local letter photo:", err);
  }
}

export function getDeletedLetterIds(): Set<string> {
  try {
    ensureLettersStore();
    const content = fs.readFileSync(DELETED_LETTERS_JSON, "utf8");
    const arr = JSON.parse(content || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    console.error("[getDeletedLetterIds] Error reading deleted letters:", err);
    return new Set();
  }
}

export function addDeletedLetterId(id: string) {
  try {
    ensureLettersStore();
    const set = getDeletedLetterIds();
    set.add(id);
    fs.writeFileSync(DELETED_LETTERS_JSON, JSON.stringify(Array.from(set), null, 2), "utf8");
  } catch (err) {
    console.error("[addDeletedLetterId] Error adding deleted letter id:", err);
  }
}

export function readLocalLetters(): StoredLetter[] {
  try {
    ensureLettersStore();
    const content = fs.readFileSync(LETTERS_JSON, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("[readLocalLetters] Error reading letters:", err);
    return [];
  }
}

export function writeLocalLetters(items: StoredLetter[]) {
  try {
    ensureLettersStore();
    fs.writeFileSync(LETTERS_JSON, JSON.stringify(items, null, 2), "utf8");
  } catch (err) {
    console.error("[writeLocalLetters] Error writing letters:", err);
  }
}

async function getLettersDbClient() {
  if (process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return supabaseAdmin;
    } catch (e) {
      console.warn("[getLettersDbClient] Falling back to standard supabase client:", e);
    }
  }
  return supabase;
}

export async function fetchAllLetters(): Promise<StoredLetter[]> {
  const localList = readLocalLetters();
  const deletedIds = getDeletedLetterIds();
  const map = new Map<string, StoredLetter>();

  // Add local records
  for (const l of localList) {
    if (!deletedIds.has(l.id)) {
      map.set(l.id, l);
    }
  }

  // Also query Supabase if available
  try {
    const db = await getLettersDbClient();
    const { data: remoteData, error } = await db
      .from("guestbook_entries")
      .select("id,name,relationship,message,photo_storage_path,approved,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[fetchAllLetters] Supabase fetch error:", error.message);
    } else if (remoteData) {
      for (const r of remoteData) {
        if (!deletedIds.has(r.id)) {
          const existing = map.get(r.id);
          map.set(r.id, {
            id: r.id,
            name: r.name,
            relationship: r.relationship,
            message: r.message,
            photoStoragePath: r.photo_storage_path || existing?.photoStoragePath || null,
            approved: r.approved ?? true,
            createdAt: r.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[fetchAllLetters] Supabase fetch exception:", err);
  }

  const all = Array.from(map.values());
  all.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
  return all;
}

export async function resolveLetterPhotoUrl(storagePath?: string | null): Promise<string | null> {
  if (!storagePath) return null;

  try {
    // Attempt to generate signed URL (valid for 6 hours)
    const { data: signedData, error: signedErr } = await supabase.storage
      .from("guestbook-photos")
      .createSignedUrl(storagePath, 60 * 60 * 6);

    if (!signedErr && signedData?.signedUrl) {
      return signedData.signedUrl;
    }
  } catch (err) {
    console.warn("[resolveLetterPhotoUrl] Signed URL note:", err);
  }

  try {
    const { data: pubData } = supabase.storage
      .from("guestbook-photos")
      .getPublicUrl(storagePath);
    if (pubData?.publicUrl) {
      return pubData.publicUrl;
    }
  } catch (err) {
    console.warn("[resolveLetterPhotoUrl] Public URL note:", err);
  }

  // Check if local file exists
  if (fs.existsSync(path.join(LETTERS_PHOTOS_DIR, storagePath))) {
    return `/letters/photos/${storagePath}`;
  }

  return null;
}

export async function syncLetterToSupabase(letter: StoredLetter, action: "insert" | "delete") {
  try {
    const db = await getLettersDbClient();
    if (action === "insert") {
      const { error } = await db.from("guestbook_entries").insert({
        id: letter.id,
        name: letter.name,
        relationship: letter.relationship,
        message: letter.message,
        photo_storage_path: letter.photoStoragePath || null,
        approved: letter.approved,
        created_at: letter.createdAt,
      });
      if (error) {
        console.error("[syncLetterToSupabase] INSERT error:", error.message, error);
      } else {
        console.log("[syncLetterToSupabase] Successfully inserted letter ID:", letter.id);
      }
    } else if (action === "delete") {
      const { error } = await db.from("guestbook_entries").delete().eq("id", letter.id);
      if (error) {
        console.error("[syncLetterToSupabase] DELETE error:", error.message);
      }
    }
  } catch (err) {
    console.warn("[syncLetterToSupabase] Supabase sync exception:", err);
  }
}

export async function deleteLetterHandler(id: string) {
  addDeletedLetterId(id);

  const localList = readLocalLetters();
  const target = localList.find((l) => l.id === id);
  const filtered = localList.filter((l) => l.id !== id);
  writeLocalLetters(filtered);

  let photoPath = target?.photoStoragePath;

  const db = await getLettersDbClient();

  // If not found in local, check Supabase
  if (!photoPath) {
    try {
      const { data: row } = await db
        .from("guestbook_entries")
        .select("photo_storage_path")
        .eq("id", id)
        .maybeSingle();
      if (row?.photo_storage_path) {
        photoPath = row.photo_storage_path;
      }
    } catch {
      // Ignore
    }
  }

  // Delete physical local photo if present
  if (photoPath) {
    deleteLocalLetterPhoto(photoPath);
  }

  // Delete from Supabase Storage and Database
  try {
    if (photoPath) {
      await db.storage.from("guestbook-photos").remove([photoPath]);
    }
    await db.from("guestbook_entries").delete().eq("id", id);
  } catch (err) {
    console.warn("[deleteLetterHandler] Supabase delete note:", err);
  }

  return { ok: true as const, id };
}

export { verifyJournalPasscode };
