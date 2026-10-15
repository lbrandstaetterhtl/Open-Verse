import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CONSTELLATION_NAMES, type ConstellationName } from "@/lib/theme-utils";

/** Star with chart position (viewBox 420×130) and magnitude class: 1 = brightest, 3 = faint. */
type ChartStar = { id: string; x: number; y: number; mag: 1 | 2 | 3; name?: string };

interface ChartData {
  label: string;
  abbr: string;
  /** Right ascension / declination of the chart centre, shown as coordinates. */
  ra: string;
  dec: string;
  stars: ChartStar[];
  lines: [string, string][];
}

// Shapes follow the real constellations (simplified, mirrored as seen on a star chart).
export const STAR_CHARTS: Record<Exclude<ConstellationName, "auto">, ChartData> = {
  orion: {
    label: "Orion",
    abbr: "Ori",
    ra: "05h 35m",
    dec: "+05°",
    stars: [
      { id: "meissa", x: 200, y: 14, mag: 3 },
      { id: "betelgeuse", x: 150, y: 32, mag: 1, name: "Betelgeuse" },
      { id: "bellatrix", x: 252, y: 40, mag: 2, name: "Bellatrix" },
      { id: "alnitak", x: 182, y: 72, mag: 2 },
      { id: "alnilam", x: 201, y: 67, mag: 2 },
      { id: "mintaka", x: 220, y: 62, mag: 2 },
      { id: "saiph", x: 166, y: 116, mag: 2 },
      { id: "rigel", x: 266, y: 110, mag: 1, name: "Rigel" },
    ],
    lines: [["meissa", "betelgeuse"], ["meissa", "bellatrix"], ["betelgeuse", "alnitak"], ["bellatrix", "mintaka"], ["alnitak", "alnilam"], ["alnilam", "mintaka"], ["alnitak", "saiph"], ["mintaka", "rigel"]],
  },
  "ursa-major": {
    label: "Ursa Major",
    abbr: "UMa",
    ra: "11h 00m",
    dec: "+56°",
    stars: [
      { id: "alkaid", x: 70, y: 76, mag: 2, name: "Alkaid" },
      { id: "mizar", x: 128, y: 46, mag: 2 },
      { id: "alcor", x: 133, y: 40, mag: 3 },
      { id: "alioth", x: 180, y: 38, mag: 2 },
      { id: "megrez", x: 232, y: 46, mag: 3 },
      { id: "phecda", x: 244, y: 86, mag: 2 },
      { id: "merak", x: 308, y: 78, mag: 2 },
      { id: "dubhe", x: 302, y: 34, mag: 1, name: "Dubhe" },
    ],
    lines: [["alkaid", "mizar"], ["mizar", "alioth"], ["alioth", "megrez"], ["megrez", "phecda"], ["phecda", "merak"], ["merak", "dubhe"], ["dubhe", "megrez"]],
  },
  cassiopeia: {
    label: "Cassiopeia",
    abbr: "Cas",
    ra: "01h 00m",
    dec: "+60°",
    stars: [
      { id: "caph", x: 108, y: 36, mag: 2, name: "Caph" },
      { id: "schedar", x: 162, y: 92, mag: 1, name: "Schedar" },
      { id: "navi", x: 212, y: 54, mag: 2 },
      { id: "ruchbah", x: 264, y: 94, mag: 2 },
      { id: "segin", x: 320, y: 46, mag: 3 },
    ],
    lines: [["caph", "schedar"], ["schedar", "navi"], ["navi", "ruchbah"], ["ruchbah", "segin"]],
  },
  cygnus: {
    label: "Cygnus",
    abbr: "Cyg",
    ra: "20h 37m",
    dec: "+42°",
    stars: [
      { id: "deneb", x: 214, y: 14, mag: 1, name: "Deneb" },
      { id: "sadr", x: 210, y: 60, mag: 2 },
      { id: "eta", x: 208, y: 90, mag: 3 },
      { id: "albireo", x: 206, y: 120, mag: 2, name: "Albireo" },
      { id: "gienah", x: 152, y: 76, mag: 2 },
      { id: "zeta", x: 108, y: 104, mag: 3 },
      { id: "fawaris", x: 268, y: 44, mag: 2 },
      { id: "kappa", x: 312, y: 22, mag: 3 },
    ],
    lines: [["deneb", "sadr"], ["sadr", "eta"], ["eta", "albireo"], ["zeta", "gienah"], ["gienah", "sadr"], ["sadr", "fawaris"], ["fawaris", "kappa"]],
  },
  leo: {
    label: "Leo",
    abbr: "Leo",
    ra: "10h 40m",
    dec: "+15°",
    stars: [
      { id: "rasElased", x: 116, y: 16, mag: 3 },
      { id: "adhafera", x: 142, y: 24, mag: 3 },
      { id: "algieba", x: 152, y: 48, mag: 2, name: "Algieba" },
      { id: "eta", x: 136, y: 72, mag: 3 },
      { id: "regulus", x: 130, y: 104, mag: 1, name: "Regulus" },
      { id: "zosma", x: 262, y: 50, mag: 2 },
      { id: "chertan", x: 266, y: 92, mag: 3 },
      { id: "denebola", x: 334, y: 86, mag: 2, name: "Denebola" },
    ],
    lines: [["rasElased", "adhafera"], ["adhafera", "algieba"], ["algieba", "eta"], ["eta", "regulus"], ["algieba", "zosma"], ["zosma", "denebola"], ["denebola", "chertan"], ["chertan", "regulus"], ["zosma", "chertan"]],
  },
  lyra: {
    label: "Lyra",
    abbr: "Lyr",
    ra: "18h 50m",
    dec: "+36°",
    stars: [
      { id: "vega", x: 176, y: 26, mag: 1, name: "Vega" },
      { id: "epsilon", x: 144, y: 14, mag: 3 },
      { id: "zeta", x: 198, y: 56, mag: 3 },
      { id: "delta", x: 236, y: 52, mag: 3 },
      { id: "sulafat", x: 248, y: 100, mag: 2, name: "Sulafat" },
      { id: "sheliak", x: 192, y: 108, mag: 2, name: "Sheliak" },
    ],
    lines: [["vega", "epsilon"], ["vega", "zeta"], ["zeta", "delta"], ["delta", "sulafat"], ["sulafat", "sheliak"], ["sheliak", "zeta"]],
  },
};

const CHART_KEYS = CONSTELLATION_NAMES.filter((n) => n !== "auto") as Exclude<ConstellationName, "auto">[];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic faint background stars, so a chart looks the same on every render. */
function fieldStars(seed: number, count = 46) {
  let state = seed || 1;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  return Array.from({ length: count }, () => ({ x: 6 + next() * 408, y: 4 + next() * 122, r: 0.4 + next() * 0.7, o: 0.18 + next() * 0.4 }));
}

/** The constellation chosen in the theme (data-constellation-name on <html>), kept in sync with theme changes. */
function useChosenConstellation(): ConstellationName {
  const read = () => (document.documentElement.dataset.constellationName as ConstellationName) || "auto";
  const [name, setName] = useState<ConstellationName>(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setName(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-constellation-name"] });
    return () => observer.disconnect();
  }, []);
  return name;
}

interface StarChartProps {
  className?: string;
  /** Picks the constellation when the theme is set to "auto" (e.g. the page path). */
  seed?: string;
  /** Overrides the theme choice, e.g. for previews in the theme builder. */
  name?: ConstellationName;
}

/** Star-chart drawing behind page titles. Hidden when the theme turns constellations off. */
export function StarChart({ className, seed = "", name }: StarChartProps) {
  const chosen = useChosenConstellation();
  const wanted = name ?? chosen;
  const key = wanted === "auto" ? CHART_KEYS[hash(seed) % CHART_KEYS.length] : wanted;
  const chart = STAR_CHARTS[key];
  const byId = Object.fromEntries(chart.stars.map((s) => [s.id, s]));
  const field = fieldStars(hash(key));

  return (
    <svg aria-hidden="true" viewBox="0 0 420 130" className={cn("ov-constellation ov-star-chart pointer-events-none", className)}>
      {/* Coordinate grid: one declination arc and hour lines, very faint. */}
      <g className="stroke-foreground/10" fill="none" strokeWidth="0.6">
        <path d="M0 98 Q210 74 420 98" strokeDasharray="2 4" />
        <path d="M0 40 Q210 18 420 40" strokeDasharray="2 4" />
        <line x1="96" y1="0" x2="84" y2="130" strokeDasharray="2 4" />
        <line x1="324" y1="0" x2="336" y2="130" strokeDasharray="2 4" />
      </g>
      <text x="100" y="10" className="fill-muted-foreground/60 font-data" fontSize="7">{chart.ra}</text>
      <text x="4" y="94" className="fill-muted-foreground/60 font-data" fontSize="7">{chart.dec}</text>

      {field.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} className="fill-foreground" opacity={s.o} />
      ))}

      {chart.lines.map(([a, b]) => (
        <line key={a + b} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} className="stroke-star/45" strokeWidth="0.9" />
      ))}

      {chart.stars.map((s) => (
        <g key={s.id}>
          {s.mag === 1 && <circle cx={s.x} cy={s.y} r="7" className="fill-star/10 stroke-star/40 ov-star-pulse" strokeWidth="0.6" />}
          <circle cx={s.x} cy={s.y} r={s.mag === 1 ? 3 : s.mag === 2 ? 2.1 : 1.4} className={s.mag === 1 ? "fill-star" : "fill-foreground/85"} />
          {s.name && (
            <text x={s.x + 7} y={s.y - 5} className="fill-muted-foreground font-data" fontSize="7" letterSpacing="0.4">
              {s.name}
            </text>
          )}
        </g>
      ))}

      <text x="416" y="126" textAnchor="end" className="fill-star/80 font-data" fontSize="8" letterSpacing="1.2">
        {chart.label.toUpperCase()} · {chart.abbr}
      </text>
    </svg>
  );
}
