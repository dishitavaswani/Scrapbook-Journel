import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/integrations/supabase/client";
import { verifyJournalPasscode } from "./journal.server";

const LETTERS_DIR = path.resolve("public/letters");
const LETTERS_JSON = path.join(LETTERS_DIR, "letters.json");
const DELETED_LETTERS_JSON = path.join(LETTERS_DIR, "deleted.json");

export type StoredLetter = {
  id: string;
  name: string;
  relationship: string | null;
  message: string;
  approved: boolean;
  createdAt: string;
};

export function ensureLettersStore() {
  if (!fs.existsSync(LETTERS_DIR)) {
    fs.mkdirSync(LETTERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LETTERS_JSON)) {
    fs.writeFileSync(LETTERS_JSON, "[]", "utf8");
  }
  if (!fs.existsSync(DELETED_LETTERS_JSON)) {
    fs.writeFileSync(DELETED_LETTERS_JSON, "[]", "utf8");
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
    const { data: remoteData, error } = await supabase
      .from("guestbook_entries")
      .select("id,name,relationship,message,approved,created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error && remoteData) {
      for (const r of remoteData) {
        if (!deletedIds.has(r.id) && !map.has(r.id)) {
          map.set(r.id, {
            id: r.id,
            name: r.name,
            relationship: r.relationship,
            message: r.message,
            approved: r.approved ?? true,
            createdAt: r.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[fetchAllLetters] Supabase fetch note:", err);
  }

  const all = Array.from(map.values());
  all.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
  return all;
}

export async function syncLetterToSupabase(letter: StoredLetter, action: "insert" | "delete") {
  try {
    if (action === "insert") {
      await supabase.from("guestbook_entries").insert({
        id: letter.id,
        name: letter.name,
        relationship: letter.relationship,
        message: letter.message,
        approved: letter.approved,
        created_at: letter.createdAt,
      });
    } else if (action === "delete") {
      await supabase.from("guestbook_entries").delete().eq("id", letter.id);
    }
  } catch (err) {
    console.warn("[syncLetterToSupabase] Supabase sync note:", err);
  }
}

export { verifyJournalPasscode };
