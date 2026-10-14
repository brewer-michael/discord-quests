import { createRng } from "@dq/core/rng";
import type { MapDef, RegionDef } from "@dq/core/world";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

export type RegionState = "unknown" | "rumored" | "discovered" | "visited";

export interface MapRenderInput {
  map: MapDef;
  regions: RegionDef[];
  states: Record<string, RegionState>;
  partyRegionId: string;
  /** Regions visited, in order, for the dotted trail. */
  trail: string[];
  /** Zoom in on one region and its neighbors. */
  focusRegionId?: string | null;
  title?: string;
}

const BIOME_TINT: Record<string, string> = {
  village: "#e8d39a",
  meadow: "#c9df9b",
  forest: "#86b57f",
  marsh: "#9cc4b0",
  mountain: "#c4ab92",
  coast: "#d3e4dc",
  desert: "#f0d898",
  fen: "#a3baa2",
  ruins: "#c6bda9",
  fortress: "#9b9bab",
  volcano: "#d99a7c",
};

const SERIF = '"DejaVu Serif", "Liberation Serif", "FreeSerif", serif';

function polygonPath(ctx: SKRSContext2D, poly: Array<[number, number]>) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function bbox(points: Array<[number, number]>) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function known(state: RegionState | undefined): boolean {
  return state === "discovered" || state === "visited";
}

/** Draws the world map as a PNG. Pure apart from the canvas: same input, same image. */
export function renderMap(input: MapRenderInput): Buffer {
  const { map, regions } = input;
  const W = map.width;
  const H = map.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const rng = createRng(`map:${map.title}`);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const state = (id: string): RegionState => input.states[id] ?? "unknown";

  // Sea, with gentle wave marks.
  ctx.fillStyle = map.colors.sea;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 90; i++) {
    const x = rng.int(0, W);
    const y = rng.int(0, H);
    ctx.beginPath();
    ctx.arc(x, y, 10, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }

  // Land: every region, tinted by biome, with a little parchment speckle.
  for (const r of regions) {
    polygonPath(ctx, r.polygon);
    ctx.fillStyle = map.colors.land;
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = BIOME_TINT[r.biome] ?? map.colors.land;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "rgba(90,70,40,0.08)";
  for (let i = 0; i < 2500; i++) ctx.fillRect(rng.int(0, W), rng.int(0, H), 2, 2);

  // Region borders.
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(74,59,42,0.55)";
  ctx.lineWidth = 2;
  for (const r of regions) {
    polygonPath(ctx, r.polygon);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Roads between regions the heroes know about.
  const drawn = new Set<string>();
  for (const r of regions) {
    for (const e of r.edges) {
      const key = [r.id, e.to].sort().join("|");
      if (drawn.has(key)) continue;
      drawn.add(key);
      const other = byId.get(e.to);
      if (!other || state(r.id) === "unknown" || state(e.to) === "unknown") continue;
      const [x0, y0] = r.centroid;
      const [x1, y1] = other.centroid;
      const mx = (x0 + x1) / 2 + (y1 - y0) * 0.08;
      const my = (y0 + y1) / 2 - (x1 - x0) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.strokeStyle = e.road ? "rgba(110,80,45,0.85)" : "rgba(110,80,45,0.45)";
      ctx.lineWidth = e.road ? 4 : 2;
      ctx.setLineDash(e.road ? [] : [3, 7]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Places of interest in regions the heroes have reached.
  for (const r of regions) {
    if (!known(state(r.id))) continue;
    for (const poi of r.pois) {
      if (!poi.at || poi.kind === "secret") continue;
      const [x, y] = poi.at;
      ctx.fillStyle = map.colors.ink;
      ctx.beginPath();
      ctx.arc(x, y, poi.kind === "town" ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Fog of war: soft mist everywhere except known regions (rumored ones show faintly).
  const fog = createCanvas(W, H);
  const f = fog.getContext("2d");
  f.fillStyle = map.colors.fog;
  f.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    const x = rng.int(0, W);
    const y = rng.int(0, H);
    const radius = rng.int(30, 120);
    const g = f.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    f.fillStyle = g;
    f.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  f.globalCompositeOperation = "destination-out";
  f.fillStyle = "#000";
  f.strokeStyle = "#000";
  f.lineJoin = "round";
  for (const r of regions) {
    const s = state(r.id);
    if (s === "unknown") continue;
    const strength = s === "rumored" ? 0.5 : 1;
    // Solid cut-out, then feathered edges so the mist fades rather than stops.
    f.globalAlpha = strength;
    polygonPath(f, r.polygon);
    f.fill();
    for (const [width, alpha] of [
      [48, 0.25],
      [28, 0.35],
      [12, 0.5],
    ] as const) {
      f.globalAlpha = strength * alpha;
      f.lineWidth = width;
      polygonPath(f, r.polygon);
      f.stroke();
    }
  }
  f.globalAlpha = 1;
  ctx.drawImage(fog, 0, 0);

  // The trail the heroes have walked.
  const trail = input.trail
    .map((id) => byId.get(id)?.centroid)
    .filter((p): p is [number, number] => Boolean(p));
  if (trail.length > 1) {
    ctx.strokeStyle = "rgba(170,40,30,0.8)";
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 8]);
    ctx.lineCap = "round";
    ctx.beginPath();
    trail.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Region names.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of regions) {
    const s = state(r.id);
    if (s === "unknown") continue;
    const [x, y] = r.centroid;
    ctx.font = s === "rumored" ? `italic 20px ${SERIF}` : `bold 24px ${SERIF}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,248,230,0.85)";
    const label = s === "rumored" ? `${r.name}?` : r.name;
    ctx.strokeText(label, x, y - 26);
    ctx.fillStyle = map.colors.ink;
    ctx.fillText(label, x, y - 26);
  }

  // The party: a little glowing lantern.
  const party = byId.get(input.partyRegionId);
  if (party) {
    const [x, y] = party.centroid;
    const glow = ctx.createRadialGradient(x, y + 6, 2, x, y + 6, 46);
    glow.addColorStop(0, "rgba(255,210,90,0.95)");
    glow.addColorStop(1, "rgba(255,210,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y + 6, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a3b1a";
    ctx.fillRect(x - 9, y - 8, 18, 4);
    ctx.fillStyle = "#ffd25a";
    ctx.fillRect(x - 7, y - 4, 14, 18);
    ctx.strokeStyle = "#5a3b1a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 7, y - 4, 14, 18);
    ctx.beginPath();
    ctx.arc(x, y - 12, 5, Math.PI, 0);
    ctx.stroke();
  }

  // Compass and title.
  const [cx, cy] = map.compass;
  ctx.strokeStyle = map.colors.ink;
  ctx.fillStyle = map.colors.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 46);
  ctx.lineTo(cx + 9, cy);
  ctx.lineTo(cx, cy + 46);
  ctx.lineTo(cx - 9, cy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `bold 20px ${SERIF}`;
  ctx.fillText("N", cx, cy - 60);
  ctx.textAlign = "left";
  ctx.font = `bold 40px ${SERIF}`;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,248,230,0.9)";
  ctx.strokeText(input.title ?? map.title, 40, 60);
  ctx.fillText(input.title ?? map.title, 40, 60);

  if (!input.focusRegionId) return canvas.toBuffer("image/png");

  // Focus: crop to the region and its neighbors, then scale up.
  const focus = byId.get(input.focusRegionId);
  if (!focus) return canvas.toBuffer("image/png");
  const pts = [
    ...focus.polygon,
    ...focus.edges.flatMap((e) => (byId.get(e.to) ? [byId.get(e.to)?.centroid as [number, number]] : [])),
  ];
  const b = bbox(pts);
  const pad = 60;
  const x0 = Math.max(0, b.x0 - pad);
  const y0 = Math.max(0, b.y0 - pad);
  const w = Math.min(W, b.x1 + pad) - x0;
  const h = Math.min(H, b.y1 + pad) - y0;
  const scale = Math.min(1400 / w, 1000 / h, 2.5);
  const out = createCanvas(Math.round(w * scale), Math.round(h * scale));
  out.getContext("2d").drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
  return out.toBuffer("image/png");
}
