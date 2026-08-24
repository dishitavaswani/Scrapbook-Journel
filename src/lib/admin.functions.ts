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
  const { requireAdmin } = await import("./admin.server");
  await requireAdmin();

  let dbClient = supabase;
  try {
    if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      dbClient = supabaseAdmin;
    }
  } catch {
    // Fallback to supabase
  }

  const { data, error } = await dbClient
    .from("guestbook_entries")
    .select("id,name,relationship,message,approved,created_at")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[adminListEntries] Query warning:", error.message);
    return [];
  }
  return data ?? [];
});


export const adminSetApproved = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; approved: boolean }) =>
    z.object({ id: z.string().uuid(), approved: z.boolean() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("guestbook_entries")
      .update({ approved: data.approved })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminDeleteEntry = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("guestbook_entries").delete().eq("id", data.id);
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
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("guestbook_entries").insert(
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
  .validator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin();
    const { deleteMemoryHandler } = await import("./memories.server");
    return deleteMemoryHandler(data.id);
  });


