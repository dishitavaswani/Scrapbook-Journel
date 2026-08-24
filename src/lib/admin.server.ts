import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

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

