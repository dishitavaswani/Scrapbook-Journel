import { createFileRoute } from "@tanstack/react-router";
import locketHero from "@/assets/locket-hero.jpg";
import { IntroScreen } from "@/components/keepsake/IntroScreen";
import { StatGrid } from "@/components/keepsake/StatGrid";
import { PassportStamps } from "@/components/keepsake/PassportStamps";
import { SealedLetter } from "@/components/keepsake/SealedLetter";
import { Guestbook } from "@/components/keepsake/Guestbook";
import { Memories } from "@/components/keepsake/Memories";
import { InviteShare } from "@/components/keepsake/InviteShare";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prajakta at 35 — A Birthday Keepsake" },
      {
        name: "description",
        content:
          "A digital scrapbook for Prajakta Nakate's 35th birthday: her year in numbers, the cities she's collected, a sealed letter, and a guestbook of messages.",
      },
      { property: "og:title", content: "Prajakta at 35 — A Birthday Keepsake" },
      {
        property: "og:description",
        content:
          "Stats, passport stamps, a sealed letter to her 50-year-old self, and a wall of birthday messages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen">
      <IntroScreen />
      <header className="relative overflow-hidden">
        <img
          src={locketHero}
          alt="An antique gold locket resting on ivory linen with pressed flowers"
          width={1600}
          height={1008}
          className="h-[78vh] w-full object-cover"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,oklch(0.25_0.03_60/0.55))]" />
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="eyebrow text-background/80">Eleventh of September · Thirty-five</p>
          <h1 className="mt-5 font-serif text-6xl leading-none text-background sm:text-8xl">
            Prajakta
            <span className="block text-3xl italic tracking-wide sm:text-4xl">Nakate</span>
          </h1>
          <div className="mt-8 h-px w-24 bg-background/50" />
          <p className="mt-8 max-w-md font-serif text-xl text-background/90">
            A small locket of a life — the pages read, the miles walked, and everyone who
            loves you, kept in one place.
          </p>
        </div>
      </header>

      <StatGrid />
      <div className="mx-auto h-px w-40 bg-border" />
      <PassportStamps />
      <div className="mx-auto h-px w-40 bg-border" />
      <SealedLetter />
      <div className="mx-auto h-px w-40 bg-border" />
      <Memories />
      <div className="mx-auto h-px w-40 bg-border" />
      <Guestbook />
      <div className="mx-auto h-px w-40 bg-border" />
      <InviteShare />

      <footer className="border-t border-border py-10 text-center">
        <p className="font-serif text-lg italic text-muted-foreground">
          Made with love, for the next thirty-five.
        </p>
      </footer>
    </main>
  );
}
