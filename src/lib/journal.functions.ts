import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const unlockJournal = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) =>
    z.object({ passcode: z.string().min(1).max(100) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyJournalPasscode } = await import("./journal.server");
    const ok = verifyJournalPasscode(data.passcode);
    return { ok };
  });

export const listJournal = createServerFn({ method: "POST" })
  .validator((data: { passcode: string }) =>
    z.object({ passcode: z.string().min(1).max(100) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyJournalPasscode, readLocalJournal } = await import("./journal.server");
    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized to access private journal");
    }
    const entries = readLocalJournal();
    // Sort descending by date
    entries.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
    return entries;
  });

export const createJournalEntry = createServerFn({ method: "POST" })
  .validator(
    (data: { passcode: string; title: string; content: string; entryDate?: string }) =>
      z
        .object({
          passcode: z.string().min(1).max(100),
          title: z.string().trim().min(1, "Please provide an entry title").max(160),
          content: z.string().trim().min(1, "Please write your journal entry").max(20000),
          entryDate: z.string().max(80).optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const {
      verifyJournalPasscode,
      readLocalJournal,
      writeLocalJournal,
      syncJournalToSupabase,
    } = await import("./journal.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized");
    }

    const now = new Date();
    const formattedDate =
      data.entryDate ||
      now.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    const newRecord = {
      id: crypto.randomUUID(),
      title: data.title.trim(),
      content: data.content.trim(),
      entryDate: formattedDate,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const entries = readLocalJournal();
    entries.unshift(newRecord);
    writeLocalJournal(entries);
    await syncJournalToSupabase(newRecord, "insert");

    return { ok: true as const, entry: newRecord };
  });

export const updateJournalEntry = createServerFn({ method: "POST" })
  .validator(
    (data: { passcode: string; id: string; title: string; content: string }) =>
      z
        .object({
          passcode: z.string().min(1).max(100),
          id: z.string().uuid(),
          title: z.string().trim().min(1, "Please provide an entry title").max(160),
          content: z.string().trim().min(1, "Please write your journal entry").max(20000),
        })
        .parse(data),
  )
  .handler(async ({ data }) => {
    const {
      verifyJournalPasscode,
      readLocalJournal,
      writeLocalJournal,
      syncJournalToSupabase,
    } = await import("./journal.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized");
    }

    const entries = readLocalJournal();
    const index = entries.findIndex((e) => e.id === data.id);
    if (index === -1) throw new Error("Entry not found");

    const updated = {
      ...entries[index],
      title: data.title.trim(),
      content: data.content.trim(),
      updatedAt: new Date().toISOString(),
    };

    entries[index] = updated;
    writeLocalJournal(entries);
    await syncJournalToSupabase(updated, "update");

    return { ok: true as const, entry: updated };
  });

export const deleteJournalEntry = createServerFn({ method: "POST" })
  .validator((data: { passcode: string; id: string }) =>
    z.object({ passcode: z.string().min(1).max(100), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const {
      verifyJournalPasscode,
      readLocalJournal,
      writeLocalJournal,
      syncJournalToSupabase,
    } = await import("./journal.server");

    if (!verifyJournalPasscode(data.passcode)) {
      throw new Error("Unauthorized");
    }

    const entries = readLocalJournal();
    const target = entries.find((e) => e.id === data.id);
    const filtered = entries.filter((e) => e.id !== data.id);
    writeLocalJournal(filtered);

    if (target) {
      await syncJournalToSupabase(target, "delete");
    }

    return { ok: true as const, id: data.id };
  });
