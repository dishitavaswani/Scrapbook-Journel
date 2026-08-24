import { useEffect, useState } from "react";

export function InviteShare() {
  const [origin, setOrigin] = useState("");
  const [emails, setEmails] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const link = origin || "";
  const list = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

  const subject = encodeURIComponent("Sign Prajakta's 35th birthday guestbook");
  const body = encodeURIComponent(
    `Hello,\n\nI'm putting together a little digital scrapbook for Prajakta's 35th birthday.\n\nWould you leave her a short birthday note (and a photo, if you have one)?\n\n${link}\n\nThank you,\nParag`,
  );
  const mailto = `mailto:?bcc=${encodeURIComponent(list.join(","))}&subject=${subject}&body=${body}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const field =
    "w-full rounded-sm border border-input bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold";

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20">
      <p className="eyebrow text-center">Invite the others</p>
      <h2 className="mt-3 text-center text-3xl text-ink">Ask people to sign</h2>
      <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
        Share the link anywhere, or paste in email addresses and send them all an invitation at
        once.
      </p>

      <div className="paper hairline mx-auto mt-10 max-w-xl rounded-sm p-7">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input className={field} readOnly value={link} aria-label="Shareable link" />
          <button
            type="button"
            onClick={copy}
            className="shrink-0 rounded-sm border border-input px-6 py-3 text-xs tracking-[0.24em] uppercase text-foreground transition-colors hover:bg-accent"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <textarea
          className={`${field} mt-6 min-h-24 resize-none`}
          placeholder="friend@example.com, family@example.com…"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
        />
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {list.length > 0 ? `${list.length} address${list.length === 1 ? "" : "es"}` : "Separate addresses with commas"}
          </p>
          <a
            href={list.length > 0 ? mailto : undefined}
            aria-disabled={list.length === 0}
            className={`rounded-sm bg-primary px-6 py-3 text-xs tracking-[0.24em] uppercase text-primary-foreground transition-opacity hover:opacity-90 ${
              list.length === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            Send invitations
          </a>
        </div>
      </div>
    </section>
  );
}
