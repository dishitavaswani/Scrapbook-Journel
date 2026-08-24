import { useCallback, useEffect, useRef, useState } from "react";
import locketHero from "@/assets/locket-hero.jpg";

export function IntroScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // Steps 0 to 5

  const touchStartY = useRef<number | null>(null);
  const isThrottled = useRef(false);

  // Check if intro was already seen in this tab session
  useEffect(() => {
    try {
      const seen = sessionStorage.getItem("praju_intro_seen");
      if (seen === "true") {
        setIsVisible(false);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Prevent background scrolling while intro is active
  useEffect(() => {
    if (isVisible && !isDismissing) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = orig;
      };
    }
  }, [isVisible, isDismissing]);

  // Complete & dismiss into main site
  const handleComplete = useCallback(() => {
    setIsDismissing(true);
    try {
      sessionStorage.setItem("praju_intro_seen", "true");
    } catch {
      // Ignore
    }
    setTimeout(() => {
      setIsVisible(false);
    }, 1000);
  }, []);

  // Advance to next progressive step
  const advanceStep = useCallback(() => {
    if (isThrottled.current || isDismissing) return;
    isThrottled.current = true;

    setCurrentStep((prev) => {
      if (prev < 5) {
        return prev + 1;
      } else {
        handleComplete();
        return prev;
      }
    });

    setTimeout(() => {
      isThrottled.current = false;
    }, 550);
  }, [handleComplete, isDismissing]);

  // Step backwards on upward scroll
  const stepBack = useCallback(() => {
    if (isThrottled.current || isDismissing) return;
    isThrottled.current = true;

    setCurrentStep((prev) => (prev > 0 ? prev - 1 : 0));

    setTimeout(() => {
      isThrottled.current = false;
    }, 450);
  }, [isDismissing]);

  // Mouse wheel & trackpad listener
  useEffect(() => {
    if (!isVisible || isDismissing) return;

    function onWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) < 18) return;
      if (e.deltaY > 0) {
        advanceStep();
      } else if (e.deltaY < 0) {
        stepBack();
      }
    }

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [isVisible, isDismissing, advanceStep, stepBack]);

  // Touch swipe listener for mobile
  useEffect(() => {
    if (!isVisible || isDismissing) return;

    function onTouchStart(e: TouchEvent) {
      touchStartY.current = e.touches[0]?.clientY ?? null;
    }

    function onTouchMove(e: TouchEvent) {
      if (touchStartY.current === null) return;
      const currentY = e.touches[0]?.clientY ?? null;
      if (currentY === null) return;

      const diff = touchStartY.current - currentY;
      if (diff > 45) {
        // Swiped up -> advance
        touchStartY.current = null;
        advanceStep();
      } else if (diff < -45) {
        // Swiped down -> back
        touchStartY.current = null;
        stepBack();
      }
    }

    function onTouchEnd() {
      touchStartY.current = null;
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isVisible, isDismissing, advanceStep, stepBack]);

  // Keyboard navigation (Down / Space / Enter)
  useEffect(() => {
    if (!isVisible || isDismissing) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === " " || e.key === "Enter" || e.key === "PageDown") {
        e.preventDefault();
        advanceStep();
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        stepBack();
      } else if (e.key === "Escape") {
        handleComplete();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isVisible, isDismissing, advanceStep, stepBack, handleComplete]);

  if (!isVisible) return null;

  return (
    <div
      onClick={advanceStep}
      className={`fixed inset-0 z-[100] flex min-h-screen w-full flex-col justify-between p-6 sm:p-12 lg:p-16 select-none overflow-hidden transition-all duration-1000 ease-out cursor-pointer ${
        isDismissing
          ? "opacity-0 -translate-y-8 scale-[1.02] pointer-events-none"
          : "opacity-100 translate-y-0 scale-100"
      }`}
      style={{
        backgroundColor: "oklch(0.965 0.012 85)",
        backgroundImage: `radial-gradient(ellipse at center, rgba(250, 248, 243, 0.98) 0%, rgba(240, 234, 222, 0.94) 100%)`,
      }}
    >
      {/* Subtle paper grain texture */}
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(oklch(0.72_0.08_75/0.12)_1px,transparent_1px)] [background-size:24px_24px]" />

      {/* Top Bar: Minimal Skip Option */}
      <header className="relative z-10 flex items-center justify-between w-full">
        {/* Step indicator dots */}
        <div className="flex items-center gap-1.5 opacity-60">
          {[0, 1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className={`h-1.5 transition-all duration-500 rounded-full ${
                s === currentStep
                  ? "w-6 bg-gold"
                  : s < currentStep
                  ? "w-1.5 bg-gold/60"
                  : "w-1.5 bg-border/80"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleComplete();
          }}
          className="text-[0.68rem] uppercase tracking-[0.24em] text-muted-foreground hover:text-ink transition-colors cursor-pointer p-2"
        >
          SKIP INTRO →
        </button>
      </header>

      {/* Main Single Continuous Sheet Editorial Canvas */}
      <main className="relative z-10 my-auto mx-auto w-full max-w-4xl py-6 flex flex-col justify-center">
        {/* ================================================================= */}
        {/* STEP 1: INITIAL DEDICATION LINE                                  */}
        {/* ================================================================= */}
        <div className="transition-all duration-700 ease-out">
          <p className="eyebrow text-xs sm:text-sm tracking-[0.34em] text-gold uppercase font-medium">
            FOR PRAJU
          </p>
        </div>

        {/* ================================================================= */}
        {/* STEP 2: DEDICATION SUBTITLE                                       */}
        {/* ================================================================= */}
        <div
          className={`mt-4 transition-all duration-700 ease-out ${
            currentStep >= 1
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <p className="font-serif text-base sm:text-xl lg:text-2xl italic text-ink/80 leading-relaxed max-w-xl">
            35 years of stories, places, people &amp; memories.
          </p>
        </div>

        {/* ================================================================= */}
        {/* STEP 3: MAIN INTIMATE MESSAGE & SPREAD                            */}
        {/* ================================================================= */}
        <div className="mt-8 sm:mt-12 flex flex-col md:flex-row md:items-center md:justify-between gap-8 lg:gap-16">
          <div
            className={`transition-all duration-700 ease-out max-w-md ${
              currentStep >= 2
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl text-ink leading-tight">
              <span className="italic font-normal text-gold">Praju,</span>
              <br />
              <span className="font-serif text-2xl sm:text-4xl text-ink/90 font-light mt-1 block">
                this one is for you.
              </span>
            </h1>
          </div>

          {/* =============================================================== */}
          {/* STEP 4: PHOTOGRAPH PLACED NATURALLY ON PAPER (NO BOXES)         */}
          {/* =============================================================== */}
          <div
            className={`transition-all duration-800 ease-out self-center md:self-auto ${
              currentStep >= 3
                ? "opacity-100 translate-y-0 rotate-[1.5deg]"
                : "opacity-0 translate-y-6 rotate-0 pointer-events-none"
            }`}
          >
            <div className="relative p-2 bg-background/90 shadow-[0_12px_32px_rgba(40,25,10,0.12)] border border-border/40 max-w-[210px] sm:max-w-[240px]">
              <img
                src={locketHero}
                alt="Keepsake locket"
                className="w-full h-auto object-cover grayscale-[15%] sepia-[10%] brightness-[98%]"
              />
              <p className="mt-2 text-center text-[0.62rem] tracking-[0.2em] uppercase font-serif text-muted-foreground italic">
                Eleventh of September
              </p>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* STEP 5: TIME STAMP (1991 — 2026)                                  */}
        {/* ================================================================= */}
        <div
          className={`mt-10 sm:mt-14 transition-all duration-700 ease-out flex items-center gap-4 ${
            currentStep >= 4
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <div className="h-px w-12 sm:w-20 bg-gold/50" />
          <p className="eyebrow text-xs sm:text-sm tracking-[0.32em] text-muted-foreground font-serif">
            1991 — 2026
          </p>
        </div>

        {/* ================================================================= */}
        {/* STEP 6: FINAL TITLE REVEAL & TURN THE PAGE                        */}
        {/* ================================================================= */}
        <div
          className={`mt-6 sm:mt-8 transition-all duration-700 ease-out ${
            currentStep >= 5
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }`}
        >
          <div className="flex flex-col items-start">
            <p className="font-serif text-2xl sm:text-3xl text-ink font-semibold tracking-wider">
              PRAJU
            </p>
            <p className="text-[0.7rem] sm:text-xs uppercase tracking-[0.28em] text-gold font-serif mt-1">
              35 YEARS OF HER
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Hint / Prompt */}
      <footer className="relative z-10 w-full flex items-center justify-between pt-4 border-t border-border/40">
        <p className="font-serif text-xs italic text-muted-foreground">
          {currentStep < 5 ? (
            <span className="inline-flex items-center gap-1.5 animate-pulse">
              Scroll or swipe to uncover ↓
            </span>
          ) : (
            <span className="text-gold font-medium">Ready to open</span>
          )}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (currentStep < 5) {
              advanceStep();
            } else {
              handleComplete();
            }
          }}
          className="group text-[0.72rem] uppercase tracking-[0.24em] font-serif text-ink hover:text-gold transition-all duration-300 flex items-center gap-2 cursor-pointer"
        >
          <span>{currentStep < 5 ? "CONTINUE ↓" : "TURN THE PAGE ↓"}</span>
        </button>
      </footer>
    </div>
  );
}
