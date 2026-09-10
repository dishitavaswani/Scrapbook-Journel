import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/integrations/supabase/client";
import { verifyJournalPasscode } from "./journal.server";

const LETTERS_DIR = path.resolve("public/letters");
const LETTERS_PHOTOS_DIR = path.resolve("public/letters/photos");
const LETTERS_JSON = path.join(LETTERS_DIR, "letters.json");
const DELETED_LETTERS_JSON = path.join(LETTERS_DIR, "deleted.json");

export type PublicEnvelope = {
  id: string;
  name: string;
  relationship: string | null;
  createdAt: string;
};

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

function adminOpsToken(): string {
  return (
    process.env["ADMIN_OPS_TOKEN"] ||
    "8d085f37edcf2e18293fba234a84ac3ffb6d2d4c1ac9f73b"
  );
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

/**
 * Fetch public metadata (safe envelope cards) for the Guestbook page.
 * Never returns message body or private photo URLs.
 */
export async function fetchPublicEnvelopes(): Promise<PublicEnvelope[]> {
  const localList = readLocalLetters();
  const deletedIds = getDeletedLetterIds();
  const map = new Map<string, PublicEnvelope>();

  // Add local records
  for (const l of localList) {
    if (!deletedIds.has(l.id)) {
      map.set(l.id, {
        id: l.id,
        name: l.name,
        relationship: l.relationship,
        createdAt: l.createdAt,
      });
    }
  }

  // 1. Query guestbook_envelopes public view in Supabase (accessible without secrets)
  try {
    const { data: envelopesData, error: envError } = await supabase
      .from("guestbook_envelopes")
      .select("id,name,relationship,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!envError && envelopesData) {
      for (const env of envelopesData) {
        if (!deletedIds.has(env.id)) {
          map.set(env.id, {
            id: env.id,
            name: env.name,
            relationship: env.relationship,
            createdAt: env.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[fetchPublicEnvelopes] Envelopes view query note:", err);
  }

  // 2. Also query RPC admin_list_entries if token available (to include any new inserts)
  try {
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("admin_list_entries", {
      p_token: adminOpsToken(),
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      for (const r of rpcData) {
        if (!deletedIds.has(r.id)) {
          map.set(r.id, {
            id: r.id,
            name: r.name,
            relationship: r.relationship,
            createdAt: r.created_at || r.createdAt,
          });
        }
      }
    }
  } catch {
    // Ignore RPC fallback
  }

  const all = Array.from(map.values());
  all.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );

  console.log(`[fetchPublicEnvelopes] Loaded ${all.length} public envelopes`);
  return all;
}

/**
 * Fetch full letter records (used by admin and server unlock).
 */
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

  // Query RPC admin_list_entries using token
  try {
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("admin_list_entries", {
      p_token: adminOpsToken(),
    });

    if (!rpcErr && Array.isArray(rpcData)) {
      for (const r of rpcData) {
        if (!deletedIds.has(r.id)) {
          const existing = map.get(r.id);
          map.set(r.id, {
            id: r.id,
            name: r.name,
            relationship: r.relationship,
            message: r.message,
            photoStoragePath: r.photo_storage_path || existing?.photoStoragePath || null,
            approved: r.approved ?? true,
            createdAt: r.created_at || r.createdAt,
          });
        }
      }
    }
  } catch {
    // Ignore RPC fallback
  }

  // Also query database directly if service role or direct access available
  try {
    const db = await getLettersDbClient();
    const { data: remoteData, error } = await db
      .from("guestbook_entries")
      .select("id,name,relationship,message,photo_storage_path,approved,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && remoteData) {
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

/**
 * Fetch a single full letter by ID for authorized private unlocking.
 */
export async function fetchLetterById(id: string): Promise<StoredLetter | null> {
  const deletedIds = getDeletedLetterIds();
  if (deletedIds.has(id)) return null;

  // 1. Check local store
  const local = readLocalLetters();
  const foundLocal = local.find((l) => l.id === id);
  if (foundLocal) return foundLocal;

  // 2. Query RPC admin_list_entries
  try {
    const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("admin_list_entries", {
      p_token: adminOpsToken(),
    });
    if (!rpcErr && Array.isArray(rpcData)) {
      const match = rpcData.find((r: any) => r.id === id);
      if (match) {
        return {
          id: match.id,
          name: match.name,
          relationship: match.relationship,
          message: match.message,
          photoStoragePath: match.photo_storage_path || null,
          approved: match.approved ?? true,
          createdAt: match.created_at || match.createdAt,
        };
      }
    }
  } catch {}

  // 3. Query guestbook_entries directly
  try {
    const db = await getLettersDbClient();
    const { data: row } = await db
      .from("guestbook_entries")
      .select("id,name,relationship,message,photo_storage_path,approved,created_at")
      .eq("id", id)
      .maybeSingle();

    if (row) {
      return {
        id: row.id,
        name: row.name,
        relationship: row.relationship,
        message: row.message,
        photoStoragePath: row.photo_storage_path || null,
        approved: row.approved ?? true,
        createdAt: row.created_at,
      };
    }
  } catch {}

  return null;
}

export async function resolveLetterPhotoUrl(storagePath?: string | null): Promise<string | null> {
  if (!storagePath) return null;

  try {
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

  if (photoPath) {
    deleteLocalLetterPhoto(photoPath);
  }

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
