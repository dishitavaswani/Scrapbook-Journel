import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/integrations/supabase/client";

const MEMORIES_DIR = path.resolve("public/memories");
const MEMORIES_JSON = path.join(MEMORIES_DIR, "memories.json");
const DELETED_JSON = path.join(MEMORIES_DIR, "deleted.json");

export function ensureStore() {
  if (!fs.existsSync(MEMORIES_DIR)) {
    fs.mkdirSync(MEMORIES_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEMORIES_JSON)) {
    fs.writeFileSync(MEMORIES_JSON, "[]", "utf8");
  }
  if (!fs.existsSync(DELETED_JSON)) {
    fs.writeFileSync(DELETED_JSON, "[]", "utf8");
  }
}

export function getDeletedMemoryIds(): Set<string> {
  try {
    ensureStore();
    const content = fs.readFileSync(DELETED_JSON, "utf8");
    const arr = JSON.parse(content || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    console.error("[getDeletedMemoryIds] Error reading deleted ids:", err);
    return new Set();
  }
}

export function addDeletedMemoryId(id: string) {
  try {
    ensureStore();
    const current = getDeletedMemoryIds();
    current.add(id);
    fs.writeFileSync(DELETED_JSON, JSON.stringify(Array.from(current), null, 2), "utf8");
  } catch (err) {
    console.error("[addDeletedMemoryId] Error adding deleted id:", err);
  }
}

export function readLocalMemories(): Array<{
  id: string;
  storagePath: string;
  caption: string;
  addedBy: string | null;
  url: string;
  createdAt: string;
}> {
  try {
    ensureStore();
    const content = fs.readFileSync(MEMORIES_JSON, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("[readLocalMemories] Error reading memories file:", err);
    return [];
  }
}

export function writeLocalMemories(items: any[]) {
  try {
    ensureStore();
    fs.writeFileSync(MEMORIES_JSON, JSON.stringify(items, null, 2), "utf8");
  } catch (err) {
    console.error("[writeLocalMemories] Error writing memories file:", err);
  }
}

export function saveLocalMemoryFile(filename: string, base64Data: string) {
  ensureStore();
  const filePath = path.join(MEMORIES_DIR, filename);
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(cleanBase64, "base64");
  fs.writeFileSync(filePath, buffer);
  return buffer;
}

export function deleteLocalMemoryFile(filename: string) {
  ensureStore();
  const filePath = path.join(MEMORIES_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("[deleteLocalMemoryFile] Warning deleting local file:", e);
    }
  }
}

export async function deleteMemoryHandler(id: string) {
  console.log("[deleteMemoryHandler] Executing delete for ID:", id);
  // 1. Mark as deleted in local blacklist
  addDeletedMemoryId(id);

  // 2. Remove from local memories JSON
  const localList = readLocalMemories();
  const target = localList.find((m) => m.id === id);
  const updatedList = localList.filter((m) => m.id !== id);
  writeLocalMemories(updatedList);

  // 3. Delete local physical file
  if (target?.storagePath) {
    deleteLocalMemoryFile(target.storagePath);
  }

  // 4. Delete from Supabase Database & Storage
  try {
    if (target?.storagePath) {
      await supabase.storage.from("memories").remove([target.storagePath]);
    }
    await supabase.from("memories").delete().eq("id", id);
  } catch (err) {
    console.warn("[deleteMemoryHandler] Supabase remote delete note:", err);
  }

  try {
    if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (target?.storagePath) {
        await supabaseAdmin.storage.from("memories").remove([target.storagePath]);
      }
      await supabaseAdmin.from("memories").delete().eq("id", id);
    }
  } catch {
    // Ignore service role fallback
  }

  return { ok: true as const, id };
}
