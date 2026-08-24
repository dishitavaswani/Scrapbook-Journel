import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AdminSession = { unlocked?: boolean };

function sessionConfig() {
  const secret =
    process.env["SESSION_SECRET"] ||
    "prajakta-35th-birthday-keepsake-session-secret-key-32-chars-minimum";
  return {
    password: secret,
    name: "keepsake-admin",
    maxAge: 60 * 60 * 24 * 14,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" },
  };
}

export function getAdminSession() {
  return useSession<AdminSession>(sessionConfig());
}

export function passwordMatches(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.data.unlocked) throw new Error("Not authorized");
  return session;
}

export function adminOpsToken(): string {
  return (
    process.env["ADMIN_OPS_TOKEN"] ||
    "8d085f37edcf2e18293fba234a84ac3ffb6d2d4c1ac9f73b"
  );
}

export function adminDbClient() {
  const url =
    process.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    "https://hddmtdtfliwhysolufvm.supabase.co";
  const publishableKey =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_OChRiwmeHmsfeooPI_w1KQ_xTkDq6F5";

  return createClient<Database>(url, publishableKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
