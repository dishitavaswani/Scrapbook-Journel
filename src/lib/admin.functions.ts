import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  await requireAdmin();

  const db = adminDbClient();
  try {
    const { data: rpcData, error: rpcErr } = await (db.rpc as any)("admin_list_entries", {
      p_token: adminOpsToken(),
    });
    if (!rpcErr && rpcData) {
      return rpcData;
    }
  } catch {
    // Fallback to table select
  }

  const { data, error } = await db
    .from("guestbook_entries")
    .select("id,name,relationship,message,approved,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[adminListEntries] Query note:", error.message);
    return [];
  }
  return data ?? [];
});

export const adminSetApproved = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; approved: boolean }) =>
    z.object({ id: z.string().min(1), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    await requireAdmin();

    const db = adminDbClient();
    try {
      const { error: rpcErr } = await (db.rpc as any)("admin_set_entry_approved", {
        p_token: adminOpsToken(),
        p_id: data.id,
        p_approved: data.approved,
      });
      if (!rpcErr) return { ok: true as const };
    } catch {
      // Fallback
    }

    const { error } = await db
      .from("guestbook_entries")
      .update({ approved: data.approved })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteEntry = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
    await requireAdmin();

    const db = adminDbClient();
    try {
      const { error: rpcErr } = await (db.rpc as any)("admin_delete_entry", {
        p_token: adminOpsToken(),
        p_id: data.id,
      });
      if (!rpcErr) return { ok: true as const };
    } catch {
      // Fallback
    }

    const { error } = await db.from("guestbook_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
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
                message: z.string().trim().min(1).max(500),
              }),
            )
            .min(1)
            .max(100),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin, adminDbClient, adminOpsToken } = await import("./admin.server");
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

    const { error } = await db.from("guestbook_entries").insert(
      data.entries.map((e) => ({
        name: e.name,
        relationship: e.relationship || null,
        message: e.message,
        approved: true,
      })),
    );
    if (error) throw new Error(error.message);
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
        console.warn("[adminDeleteMemory] Direct delete note:", e);
      }
    }

    // 2. Local store deletion cleanup if available
    try {
      const { deleteMemoryHandler } = await import("./memories.server");
      await deleteMemoryHandler(data.id);
    } catch {
      // Best-effort in serverless
    }

    return { ok: true as const, id: data.id };
  });
