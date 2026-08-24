import { useEffect, useRef, useState, type FormEvent } from "react";

type Stat = { label: string; value: number; suffix?: string; caption: string };

interface StatValues {
  booksRead: number;
  weightsLifted: number;
  citiesVisited: number;
  peopleCircle: number;
}

const DEFAULT_STATS: StatValues = {
  booksRead: 412,
  weightsLifted: 5280,
  citiesVisited: 13,
  peopleCircle: 500,
};

const STORAGE_KEY = "prajakta_keepsake_stats";

function parseStoredStats(json: string | null): StatValues {
  if (!json) return DEFAULT_STATS;
  try {
    const data = JSON.parse(json);
    return {
      booksRead: typeof data.booksRead === "number" && !isNaN(data.booksRead) ? data.booksRead : DEFAULT_STATS.booksRead,
      weightsLifted: typeof data.weightsLifted === "number" && !isNaN(data.weightsLifted) ? data.weightsLifted : DEFAULT_STATS.weightsLifted,
      citiesVisited: typeof data.citiesVisited === "number" && !isNaN(data.citiesVisited) ? data.citiesVisited : DEFAULT_STATS.citiesVisited,
      peopleCircle: typeof data.peopleCircle === "number" && !isNaN(data.peopleCircle) ? data.peopleCircle : DEFAULT_STATS.peopleCircle,
    };
  } catch {
    return DEFAULT_STATS;
  }
}

function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const duration = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);
  return value;
}

function StatCard({ stat, active }: { stat: Stat; active: boolean }) {
  const value = useCountUp(stat.value, active);
  return (
    <div className="paper hairline rounded-sm px-6 py-8 text-center">
      <p className="font-serif text-5xl tabular-nums text-ink">
        {value.toLocaleString()}
        <span className="text-gold">{stat.suffix}</span>
      </p>
      <p className="mt-3 eyebrow">{stat.label}</p>
      <p className="mt-2 text-sm italic text-muted-foreground">{stat.caption}</p>
    </div>
  );
}

export function StatGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [values, setValues] = useState<StatValues>(DEFAULT_STATS);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<StatValues>(DEFAULT_STATS);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setActive(true),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Hydrate client-side stats from localStorage safely
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const initial = parseStoredStats(stored);
      setValues(initial);
      setForm(initial);
    } catch {
      // Fall back to default stats
    }
  }, []);

  const stats: Stat[] = [
    { label: "Books read", value: values.booksRead, caption: "and counting, spine by spine" },
    { label: "Weights lifted", value: values.weightsLifted, suffix: " kg", caption: "quietly stronger every year" },
    { label: "Cities visited", value: values.citiesVisited, caption: "stamps in the passport" },
    { label: "People in her circle", value: values.peopleCircle, suffix: "+", caption: "a network built on warmth" },
  ];

  function handleOpenEdit() {
    setForm(values);
    setIsEditing((prev) => !prev);
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const updated: StatValues = {
      booksRead: Math.max(0, Number(form.booksRead) || 0),
      weightsLifted: Math.max(0, Number(form.weightsLifted) || 0),
      citiesVisited: Math.max(0, Number(form.citiesVisited) || 0),
      peopleCircle: Math.max(0, Number(form.peopleCircle) || 0),
    };
    setValues(updated);
    setIsEditing(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore write errors (e.g. private browsing restrictions)
    }
  }

  function handleReset() {
    setValues(DEFAULT_STATS);
    setForm(DEFAULT_STATS);
    setIsEditing(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  }

  const inputClass =
    "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-gold";

  return (
    <section ref={ref} className="mx-auto w-full max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl text-ink">Thirty-five years, in numbers</h2>
      
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} active={active} />
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <button
          type="button"
          onClick={handleOpenEdit}
          className="inline-flex items-center gap-1.5 text-xs tracking-[0.24em] uppercase text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>✎</span> {isEditing ? "Close editor" : "Edit Stats"}
        </button>
      </div>

      {isEditing && (
        <form onSubmit={handleSave} className="paper hairline mx-auto mt-6 max-w-xl rounded-sm p-6">
          <p className="eyebrow text-center">Edit milestone stats</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Books Read
              </label>
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.booksRead}
                onChange={(e) => setForm({ ...form, booksRead: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Weights Lifted (kg)
              </label>
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.weightsLifted}
                onChange={(e) => setForm({ ...form, weightsLifted: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Cities Visited
              </label>
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.citiesVisited}
                onChange={(e) => setForm({ ...form, citiesVisited: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                People in Her Circle
              </label>
              <input
                type="number"
                min="0"
                className={inputClass}
                value={form.peopleCircle}
                onChange={(e) => setForm({ ...form, peopleCircle: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="eyebrow underline underline-offset-4 hover:text-foreground"
            >
              Reset to defaults
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-sm border border-input px-4 py-2 text-xs tracking-[0.2em] uppercase text-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-sm bg-primary px-5 py-2 text-xs tracking-[0.2em] uppercase text-primary-foreground transition-opacity hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
