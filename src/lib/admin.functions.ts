import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getAdminSession } = await import("./admin.server");
    const session = await getAdminSession();
    return { unlocked: session.data.unlocked === true };
  } catch (err) {
    console.warn("[adminStatus] Session error:", err);
    return { unlocked: false };
  }
});

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: { password: string }) =>
    z.object({ password: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const { getAdminSession, passwordMatches } = await import("./admin.server");
      const validPasswords = [
        "AArohi2026",
        "09092006",
        process.env["ADMIN_PASSWORD"],
      ].filter(Boolean) as string[];

      const matches = validPasswords.some((expected) =>
        passwordMatches(data.password.trim(), expected),
      );

      if (!matches) return { ok: false as const };
      const session = await getAdminSession();
      await session.update({ unlocked: true });
      return { ok: true as const };
    } catch (err) {
      console.error("[adminLogin] Login error:", err);
      return { ok: false as const };
    }
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { getAdminSession } = await import("./admin.server");
    const session = await getAdminSession();
    await session.clear();
  } catch (err) {
    console.warn("[adminLogout] Logout error:", err);
  }
  return { ok: true as const };
});

export const adminListEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
  const { resolveLetterPhotoUrl } = await import("./letters.server");
  await requireAdmin();

  const db = adminDbClient();
  let rows: any[] = [];

  try {
    const { data: rpcData, error: rpcErr } = await (db.rpc as any)("admin_list_entries", {
      p_token: adminOpsToken(),
    });
    if (!rpcErr && Array.isArray(rpcData)) {
      rows = rpcData;
    }
  } catch {
    // Fallback to table select
  }

  if (rows.length === 0) {
    const { data, error } = await db
      .from("guestbook_entries")
      .select("id,name,relationship,message,photo_storage_path,approved,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[adminListEntries] Query note:", error.message);
    } else if (data) {
      rows = data;
    }
  }

  // Resolve photo URLs
  const results = await Promise.all(
    rows.map(async (r) => {
      const photoUrl = await resolveLetterPhotoUrl(r.photo_storage_path);
      return {
        id: r.id,
        name: r.name,
        relationship: r.relationship,
        message: r.message,
        photo_storage_path: r.photo_storage_path ?? null,
        photoUrl: photoUrl ?? null,
        approved: r.approved ?? true,
        created_at: r.created_at,
      };
    }),
  );

  return results;
});

export const adminSetApproved = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; approved: boolean }) =>
    z.object({ id: z.string().min(1), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    const { readLocalLetters, writeLocalLetters } = await import("./letters.server");
    await requireAdmin();

    const db = adminDbClient();
    try {
      const { error: rpcErr } = await (db.rpc as any)("admin_set_entry_approved", {
        p_token: adminOpsToken(),
        p_id: data.id,
        p_approved: data.approved,
      });
      if (!rpcErr) {
        // Also update local letters
        const local = readLocalLetters();
        const updated = local.map((l) => (l.id === data.id ? { ...l, approved: data.approved } : l));
        writeLocalLetters(updated);
        return { ok: true as const };
      }
    } catch {
      // Fallback
    }

    const { error } = await db
      .from("guestbook_entries")
      .update({ approved: data.approved })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    const local = readLocalLetters();
    const updated = local.map((l) => (l.id === data.id ? { ...l, approved: data.approved } : l));
    writeLocalLetters(updated);

    return { ok: true as const };
  });

export const adminDeleteEntry = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    const { deleteLetterHandler } = await import("./letters.server");
    await requireAdmin();

    const db = adminDbClient();
    try {
      await (db.rpc as any)("admin_delete_entry", {
        p_token: adminOpsToken(),
        p_id: data.id,
      });
    } catch {
      // Fallback
    }

    // Call shared deletion handler for database, storage bucket, local files & blacklist
    await deleteLetterHandler(data.id);

    return { ok: true as const };
  });

export const adminAddLetter = createServerFn({ method: "POST" })
  .validator(
    (data: {
      name: string;
      relationship?: string;
      message: string;
      photoBase64?: string;
      photoName?: string;
    }) =>
      z
        .object({
          name: z.string().trim().min(1, "Please provide sender's name").max(60),
          relationship: z.string().trim().max(60).optional(),
          message: z
            .string()
            .trim()
            .min(1, "Please enter the letter")
            .max(10000, "Letter cannot exceed 10,000 characters"),
          photoBase64: z.string().optional(),
          photoName: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();

    const {
      readLocalLetters,
      writeLocalLetters,
      syncLetterToSupabase,
      saveLocalLetterPhoto,
    } = await import("./letters.server");

    const id = crypto.randomUUID();
    let photoStoragePath: string | null = null;

    if (data.photoBase64 && data.photoName) {
      const ext = (data.photoName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
      photoStoragePath = `${id}.${safeExt}`;

      const cleanBase64 = data.photoBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const mime =
        safeExt === "png"
          ? "image/png"
          : safeExt === "webp"
          ? "image/webp"
          : "image/jpeg";

      try {
        await supabase.storage.from("guestbook-photos").upload(photoStoragePath, buffer, {
          contentType: mime,
          upsert: true,
        });
      } catch (err) {
        console.warn("[adminAddLetter] Storage upload warning:", err);
      }

      saveLocalLetterPhoto(photoStoragePath, data.photoBase64);
    }

    const now = new Date();
    const newLetter = {
      id,
      name: data.name.trim(),
      relationship: data.relationship?.trim() || null,
      message: data.message.trim(),
      photoStoragePath,
      approved: true,
      createdAt: now.toISOString(),
    };

    const letters = readLocalLetters();
    letters.unshift(newLetter);
    writeLocalLetters(letters);
    await syncLetterToSupabase(newLetter, "insert");

    return { ok: true as const, id: newLetter.id };
  });

export const adminAddOfflineEntries = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { entries: { name: string; relationship?: string; message: string }[] }) =>
      z
        .object({
          entries: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(60),
                relationship: z.string().trim().max(60).optional(),
                message: z.string().trim().min(1).max(10000),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    const { readLocalLetters, writeLocalLetters } = await import("./letters.server");
    await requireAdmin();

    const db = adminDbClient();
    try {
      const { data: rpcData, error: rpcErr } = await (db.rpc as any)("admin_add_entries", {
        p_token: adminOpsToken(),
        p_entries: data.entries,
      });
      if (!rpcErr) {
        return { ok: true as const, count: typeof rpcData === "number" ? rpcData : data.entries.length };
      }
    } catch {
      // Fallback
    }

    const newEntries = data.entries.map((e) => ({
      id: crypto.randomUUID(),
      name: e.name,
      relationship: e.relationship || null,
      message: e.message,
      photo_storage_path: null,
      approved: true,
      created_at: new Date().toISOString(),
    }));

    const { error } = await db.from("guestbook_entries").insert(newEntries);
    if (error) throw new Error(error.message);

    // Sync to local letters JSON
    const local = readLocalLetters();
    for (const item of newEntries) {
      local.unshift({
        id: item.id,
        name: item.name,
        relationship: item.relationship,
        message: item.message,
        photoStoragePath: null,
        approved: true,
        createdAt: item.created_at,
      });
    }
    writeLocalLetters(local);

    return { ok: true as const, count: data.entries.length };
  });

export const adminDeleteMemory = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    await requireAdmin();

    const db = adminDbClient();

    // 1. Call token-guarded RPC to delete row from database
    try {
      const { error: rpcErr } = await (db.rpc as any)("admin_delete_memory", {
        p_token: adminOpsToken(),
        p_id: data.id,
      });
      if (rpcErr) {
        console.warn("[adminDeleteMemory] RPC note:", rpcErr.message);
        await db.from("memories").delete().eq("id", data.id);
      }
    } catch {
      try {
        await db.from("memories").delete().eq("id", data.id);
      } catch (e) {
        console.warn("[adminDeleteMemory] Fallback delete error:", e);
      }
    }

    // 2. Call handler to delete storage image and local backup
    try {
      const { deleteMemoryHandler } = await import("./memories.server");
      await deleteMemoryHandler(data.id);
    } catch (e) {
      console.warn("[adminDeleteMemory] Storage cleanup warning:", e);
    }

    return { ok: true as const };
  });
