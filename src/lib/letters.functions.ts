import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const listPublicLetters = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchPublicEnvelopes } = await import("./letters.server");
  const envelopes = await fetchPublicEnvelopes();
  return envelopes;
});

export const submitLetter = createServerFn({ method: "POST" })
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
          name: z.string().trim().min(1, "Please provide your name").max(60),
          relationship: z.string().trim().max(60).optional(),
          message: z
            .string()
            .trim()
            .min(1, "Please write your letter")
            .max(10000, "Letter cannot exceed 10,000 characters"),
          photoBase64: z.string().optional(),
          photoName: z.string().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
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

      // 1. Upload to Supabase Storage bucket guestbook-photos
      try {
        await supabase.storage.from("guestbook-photos").upload(photoStoragePath, buffer, {
          contentType: mime,
          upsert: true,
        });
      } catch (err) {
        console.warn("[submitLetter] Supabase storage upload warning:", err);
      }

      // 2. Save local photo copy for offline caching
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

    return {
      ok: true as const,
      letter: {
        id: newLetter.id,
        name: newLetter.name,
        relationship: newLetter.relationship,
        createdAt: newLetter.createdAt,
      },
    };
  });

export const unlockPrivateLetter = createServerFn({ method: "POST" })
  .validator((data: { id: string; passcode: string }) =>
    z
      .object({
        id: z.string().min(1),
        passcode: z.string().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const {
      verifyJournalPasscode,
      fetchLetterById,
      resolveLetterPhotoUrl,
    } = await import("./letters.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Incorrect passcode. Try again.");
    }

    const letter = await fetchLetterById(data.id);
    if (!letter) {
      throw new Error("Letter not found");
    }

    const photoUrl = await resolveLetterPhotoUrl(letter.photoStoragePath);

    return {
      ok: true as const,
      letter: {
        id: letter.id,
        name: letter.name,
        relationship: letter.relationship,
        message: letter.message,
        photoUrl: photoUrl ?? null,
        createdAt: letter.createdAt,
      },
    };
  });

export const deletePrivateLetter = createServerFn({ method: "POST" })
  .validator((data: { id: string; passcode: string }) =>
    z
      .object({
        id: z.string().min(1),
        passcode: z.string().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyJournalPasscode, deleteLetterHandler } = await import("./letters.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized");
    }

    await deleteLetterHandler(data.id);

    return { ok: true as const, id: data.id };
  });
