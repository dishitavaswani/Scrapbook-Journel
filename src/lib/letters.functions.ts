import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listPublicLetters = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAllLetters } = await import("./letters.server");
  const letters = await fetchAllLetters();

  // Return ONLY public metadata (name, relationship, id, createdAt) — NEVER return message!
  const publicList = letters
    .filter((l) => l.approved !== false)
    .map((l) => ({
      id: l.id,
      name: l.name,
      relationship: l.relationship,
      createdAt: l.createdAt,
    }));

  return publicList;
});

export const submitLetter = createServerFn({ method: "POST" })
  .validator(
    (data: { name: string; relationship?: string; message: string }) =>
      z
        .object({
          name: z.string().trim().min(1, "Please provide your name").max(60),
          relationship: z.string().trim().max(60).optional(),
          message: z.string().trim().min(1, "Please write a birthday message").max(1000),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const { readLocalLetters, writeLocalLetters, syncLetterToSupabase } = await import(
      "./letters.server"
    );

    const now = new Date();
    const newLetter = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      relationship: data.relationship?.trim() || null,
      message: data.message.trim(),
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
        id: z.string().uuid(),
        passcode: z.string().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyJournalPasscode, fetchAllLetters, getDeletedLetterIds } = await import(
      "./letters.server"
    );

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Incorrect passcode. Try again.");
    }

    const deletedIds = getDeletedLetterIds();
    if (deletedIds.has(data.id)) {
      throw new Error("This letter has been removed.");
    }

    const letters = await fetchAllLetters();
    const letter = letters.find((l) => l.id === data.id);
    if (!letter) {
      throw new Error("Letter not found");
    }

    return {
      ok: true as const,
      letter: {
        id: letter.id,
        name: letter.name,
        relationship: letter.relationship,
        message: letter.message,
        createdAt: letter.createdAt,
      },
    };
  });

export const deletePrivateLetter = createServerFn({ method: "POST" })
  .validator((data: { id: string; passcode: string }) =>
    z
      .object({
        id: z.string().uuid(),
        passcode: z.string().min(1).max(100),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const {
      verifyJournalPasscode,
      readLocalLetters,
      writeLocalLetters,
      addDeletedLetterId,
      syncLetterToSupabase,
    } = await import("./letters.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized");
    }

    addDeletedLetterId(data.id);

    const letters = readLocalLetters();
    const target = letters.find((l) => l.id === data.id);
    const filtered = letters.filter((l) => l.id !== data.id);
    writeLocalLetters(filtered);

    if (target) {
      await syncLetterToSupabase(target, "delete");
    }

    return { ok: true as const, id: data.id };
  });
