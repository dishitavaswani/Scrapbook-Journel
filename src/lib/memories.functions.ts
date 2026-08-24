import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function getSupabaseBackendClient() {
  const url = process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"] || "https://hddmtdtfliwhysolufvm.supabase.co";
  const publishableKey =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_OChRiwmeHmsfeooPI_w1KQ_xTkDq6F5";

  return createClient<Database>(url, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const listMemories = createServerFn({ method: "GET" }).handler(async () => {
  const backend = getSupabaseBackendClient();

  const { data, error } = await backend
    .from("memories")
    .select("id,storage_path,caption,added_by,created_at")
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    console.warn("[listMemories] Supabase query warning:", error.message);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Generate signed URLs (valid for 6 hours) for guaranteed access
  const validPaths = rows.map((r) => r.storage_path).filter(Boolean);
  let urlByPath = new Map<string, string>();

  if (validPaths.length > 0) {
    try {
      const { data: signed } = await backend.storage
        .from("memories")
        .createSignedUrls(validPaths, 60 * 60 * 6);

      if (signed) {
        urlByPath = new Map(signed.map((s) => [s.path ?? "", s.signedUrl]));
      }
    } catch (e) {
      console.warn("[listMemories] Signed URLs error:", e);
    }
  }

  return rows.map((r) => {
    let finalUrl = urlByPath.get(r.storage_path);
    if (!finalUrl && r.storage_path) {
      const { data: pubData } = backend.storage.from("memories").getPublicUrl(r.storage_path);
      finalUrl = pubData?.publicUrl ?? `/memories/${r.storage_path}`;
    }
    return {
      id: r.id,
      caption: r.caption,
      addedBy: r.added_by,
      storagePath: r.storage_path,
      url: finalUrl ?? null,
      createdAt: r.created_at,
    };
  });
});

export const addMemory = createServerFn({ method: "POST" })
  .validator(
    (data: { fileBase64: string; fileName: string; caption: string; addedBy?: string }) =>
      z
        .object({
          fileBase64: z.string().min(1),
          fileName: z.string().min(1),
          caption: z.string().trim().min(1).max(160),
          addedBy: z.string().trim().max(60).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const backend = getSupabaseBackendClient();
    const id = crypto.randomUUID();
    const ext = (data.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const storageFilename = `${id}.${ext}`;

    const cleanBase64 = data.fileBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    // 1. Upload to Supabase Storage
    try {
      await backend.storage.from("memories").upload(storageFilename, buffer, {
        contentType: mime,
        upsert: true,
      });
    } catch (err) {
      console.warn("[addMemory] Storage upload error:", err);
    }

    // 2. Insert into database
    const { error: dbErr } = await backend.from("memories").insert({
      id,
      storage_path: storageFilename,
      caption: data.caption,
      added_by: data.addedBy || null,
    });

    if (dbErr) {
      console.error("[addMemory] Database insert error:", dbErr.message);
      throw new Error("Failed to save memory record");
    }

    // 3. Get public/signed URL
    const { data: pubData } = backend.storage.from("memories").getPublicUrl(storageFilename);
    const publicUrl = pubData?.publicUrl ?? `/memories/${storageFilename}`;

    const newMemory = {
      id,
      storagePath: storageFilename,
      caption: data.caption,
      addedBy: data.addedBy || null,
      url: publicUrl,
      createdAt: new Date().toISOString(),
    };

    // Optional local cache
    try {
      const { readLocalMemories, writeLocalMemories, saveLocalMemoryFile } = await import("./memories.server");
      saveLocalMemoryFile(storageFilename, data.fileBase64);
      const localList = readLocalMemories();
      localList.unshift(newMemory);
      writeLocalMemories(localList);
    } catch {
      // Ignore in serverless
    }

    return { ok: true as const, memory: newMemory };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const backend = getSupabaseBackendClient();

    // Fetch storage_path before deleting
    try {
      const { data: row } = await backend.from("memories").select("storage_path").eq("id", data.id).maybeSingle();
      if (row?.storage_path) {
        await backend.storage.from("memories").remove([row.storage_path]);
      }
      await backend.from("memories").delete().eq("id", data.id);
    } catch (err) {
      console.warn("[deleteMemory] Supabase delete note:", err);
    }

    try {
      const { deleteMemoryHandler } = await import("./memories.server");
      await deleteMemoryHandler(data.id);
    } catch {
      // Ignore in serverless
    }

    return { ok: true as const, id: data.id };
  });
