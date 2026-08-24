import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const listMemories = createServerFn({ method: "GET" }).handler(async () => {
  const { readLocalMemories, getDeletedMemoryIds } = await import("./memories.server");
  const deletedIds = getDeletedMemoryIds();
  const localItems = readLocalMemories();
  const memoryMap = new Map<string, any>();

  // Add local items that are not deleted
  for (const item of localItems) {
    if (!deletedIds.has(item.id)) {
      memoryMap.set(item.id, item);
    }
  }

  // Also query Supabase if available
  try {
    const { data: remoteData, error } = await supabase
      .from("memories")
      .select("id,storage_path,caption,added_by,created_at")
      .order("created_at", { ascending: false })
      .limit(120);

    if (!error && remoteData) {
      for (const r of remoteData) {
        if (!deletedIds.has(r.id) && !memoryMap.has(r.id)) {
          let resolvedUrl = r.storage_path;
          if (
            r.storage_path &&
            !r.storage_path.startsWith("http://") &&
            !r.storage_path.startsWith("https://") &&
            !r.storage_path.startsWith("/memories/")
          ) {
            const { data: pubData } = supabase.storage.from("memories").getPublicUrl(r.storage_path);
            resolvedUrl = pubData?.publicUrl ?? `/memories/${r.storage_path}`;
          }
          memoryMap.set(r.id, {
            id: r.id,
            caption: r.caption,
            addedBy: r.added_by,
            storagePath: r.storage_path,
            url: resolvedUrl,
            createdAt: r.created_at,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[listMemories] Supabase query note:", err);
  }

  const allItems = Array.from(memoryMap.values());
  allItems.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );

  return allItems;
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
    const { readLocalMemories, writeLocalMemories, saveLocalMemoryFile } = await import(
      "./memories.server"
    );

    const id = crypto.randomUUID();
    const ext = (data.fileName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const storageFilename = `${id}.${ext}`;

    // Save image binary directly to local storage
    const buffer = saveLocalMemoryFile(storageFilename, data.fileBase64);

    let publicUrl = `/memories/${storageFilename}`;

    // Upload to Supabase Storage and database
    try {
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const { data: uploadRes, error: uploadErr } = await supabase.storage
        .from("memories")
        .upload(storageFilename, buffer, {
          contentType: mime,
          upsert: true,
        });

      if (!uploadErr && uploadRes) {
        const { data: pubData } = supabase.storage.from("memories").getPublicUrl(storageFilename);
        if (pubData?.publicUrl) {
          publicUrl = pubData.publicUrl;
        }
      }

      await supabase.from("memories").insert({
        id,
        storage_path: storageFilename,
        caption: data.caption,
        added_by: data.addedBy || null,
      });
    } catch (syncErr) {
      console.warn("[addMemory] Supabase storage sync note:", syncErr);
    }

    const newMemory = {
      id,
      storagePath: storageFilename,
      caption: data.caption,
      addedBy: data.addedBy || null,
      url: publicUrl,
      createdAt: new Date().toISOString(),
    };

    const localList = readLocalMemories();
    localList.unshift(newMemory);
    writeLocalMemories(localList);

    return { ok: true as const, memory: newMemory };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteMemoryHandler } = await import("./memories.server");
    return deleteMemoryHandler(data.id);
  });
