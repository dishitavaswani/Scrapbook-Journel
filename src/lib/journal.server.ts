import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { supabase } from "@/integrations/supabase/client";

const JOURNAL_DIR = path.resolve("public/journal");
const JOURNAL_JSON = path.join(JOURNAL_DIR, "journal.json");

export const VALID_PASSCODES = [
  "AArohi2026",
  "09092006",
  process.env["ADMIN_PASSWORD"],
  process.env["LETTER_PASSCODE"],
].filter(Boolean) as string[];

export function verifyJournalPasscode(passcode: string): boolean {
  if (!passcode) return false;
  const cleanInput = passcode.trim();
  for (const expected of VALID_PASSCODES) {
    try {
      const a = createHash("sha256").update(cleanInput, "utf8").digest();
      const b = createHash("sha256").update(expected, "utf8").digest();
      if (timingSafeEqual(a, b)) return true;
    } catch {
      // Continue checking next passcode
    }
  }
  return false;
}

export function ensureJournalStore() {
  if (!fs.existsSync(JOURNAL_DIR)) {
    fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  }
  if (!fs.existsSync(JOURNAL_JSON)) {
    // Populate with the initial heirloom letters if empty
    const initialEntries = [
      {
        id: "a1111111-1111-4111-8111-111111111111",
        title: "To My 15-Year-Old Self",
        content:
          "If I could reach back through the twenty years between us, I would tell you to stop worrying so much about fitting into rooms that weren't built for you anyway.\n\nKeep reading late under the bedcovers. Keep scribbling notes in the margins of your notebooks. Every strange, stubborn curiosity you have right now is quietly building the woman you're going to become.\n\nYou will cross oceans, you will collect cities in passports you haven't bought yet, and you will build friendships that feel like warm hearths on cold nights.\n\nBe gentle with yourself. You are already more than enough.\n\n— With all my love,\nYour thirty-five-year-old self",
        entryDate: "11 September 2026",
        createdAt: "2026-08-24T00:00:00.000Z",
        updatedAt: "2026-08-24T00:00:00.000Z",
      },
      {
        id: "b2222222-2222-4222-8222-222222222222",
        title: "To My 50-Year-Old Self",
        content:
          "Today you turned thirty-five, and the house smelled like cardamom and old paper. You read late into the night, the way you always do, with one lamp on.\n\nI hope by now the shelf has run out of room twice over. I hope your knees are strong, your suitcase is scuffed, and there are still stamps waiting for pages you haven't opened yet.\n\nWhatever the last fifteen years brought, remember this version of you: curious, stubborn in the best way, generous with everyone who found their way into her circle. She was already enough.\n\nSave me a seat by the window.\n\n— With all my love,\nThirty-five",
        entryDate: "11 September 2026",
        createdAt: "2026-08-24T00:01:00.000Z",
        updatedAt: "2026-08-24T00:01:00.000Z",
      },
    ];
    fs.writeFileSync(JOURNAL_JSON, JSON.stringify(initialEntries, null, 2), "utf8");
  }
}

export type JournalRecord = {
  id: string;
  title: string;
  content: string;
  entryDate: string;
  createdAt: string;
  updatedAt: string;
};

export function readLocalJournal(): JournalRecord[] {
  try {
    ensureJournalStore();
    const content = fs.readFileSync(JOURNAL_JSON, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("[readLocalJournal] Error reading journal:", err);
    return [];
  }
}

export function writeLocalJournal(items: JournalRecord[]) {
  try {
    ensureJournalStore();
    fs.writeFileSync(JOURNAL_JSON, JSON.stringify(items, null, 2), "utf8");
  } catch (err) {
    console.error("[writeLocalJournal] Error writing journal:", err);
  }
}

export async function syncJournalToSupabase(entry: JournalRecord, action: "insert" | "update" | "delete") {
  try {
    if (action === "insert") {
      await supabase.from("journal_entries").insert({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        entry_date: entry.entryDate,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      });
    } else if (action === "update") {
      await supabase
        .from("journal_entries")
        .update({
          title: entry.title,
          content: entry.content,
          updated_at: entry.updatedAt,
        })
        .eq("id", entry.id);
    } else if (action === "delete") {
      await supabase.from("journal_entries").delete().eq("id", entry.id);
    }
  } catch (err) {
    console.warn("[syncJournalToSupabase] Supabase sync note:", err);
  }
}
