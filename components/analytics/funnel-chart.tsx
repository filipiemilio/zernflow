"use client";

import { useState } from "react";
import type { FunnelStage } from "@/lib/flow-analytics";

// Fixed viewBox coordinate space; the SVG scales to its container, so these
// are logical units, not pixels.
const VB_WIDTH = 1000;
const VB_HEIGHT = 270;
const MID_Y = VB_HEIGHT / 2;
const MAX_HALF_HEIGHT = 105;
const TOP_PAD = 66;
const BOTTOM_PAD = 62;
const SIDE_PAD = 24;

// Three nested bands: two translucent washes of the same hue behind the solid
// core, so the taper reads as a thick flowing ribbon. Only the core carries
// data — the outer two are the same shape at extra height, decoration that
// cannot be misread as a second series.
const LAYERS = [
  { offset: 32, opacity: 0.1 },
  { offset: 16, opacity: 0.26 },
  { offset: 0, opacity: 1 },
];

const PILL_HEIGHT = 32;
const LABEL_FONT_SIZE = 16;
const VALUE_FONT_SIZE = 20;
const VALUE_PILL_Y = -54;
const LABEL_PILL_Y = VB_HEIGHT + 16;
const PCT_PILL_HEIGHT = 38;

/** Approximate rendered width of a pill sized to its own text. */
function pillWidth(label: string, fontSize: number, padding: number): number {
  return padding + label.length * fontSize * 0.58;
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (stages.length < 2) return null;

  const count = stages.length;
  const slot = VB_WIDTH / count;
  const halfHeights = stages.map((s) => (s.pct / 100) * MAX_HALF_HEIGHT);

  // Each stage holds a flat plateau, with an S-curve taper bridging the gap to
  // the next one; the outermost plateaus run to the edges so the ribbon spans
  // the full width.
  const centerOf = (i: number) => (i + 0.5) * slot;
  const startOf = (i: number) => (i === 0 ? 0 : (i + 0.25) * slot);
  const endOf = (i: number) => (i === count - 1 ? VB_WIDTH : (i + 0.75) * slot);

  function bandPath(offset: number): string {
    const h = halfHeights.map((v) => v + offset);
    const parts: string[] = [`M ${startOf(0)} ${MID_Y - h[0]}`];

    for (let i = 0; i < count; i++) {
      parts.push(`L ${endOf(i)} ${MID_Y - h[i]}`);
      if (i < count - 1) {
        const x0 = endOf(i);
        const x1 = startOf(i + 1);
        const mid = (x0 + x1) / 2;
        parts.push(`C ${mid} ${MID_Y - h[i]}, ${mid} ${MID_Y - h[i + 1]}, ${x1} ${MID_Y - h[i + 1]}`);
      }
    }

    parts.push(`L ${VB_WIDTH} ${MID_Y + h[count - 1]}`);

    for (let i = count - 1; i >= 0; i--) {
      parts.push(`L ${startOf(i)} ${MID_Y + h[i]}`);
      if (i > 0) {
        const x0 = startOf(i);
        const x1 = endOf(i - 1);
        const mid = (x0 + x1) / 2;
        parts.push(`C ${mid} ${MID_Y + h[i]}, ${mid} ${MID_Y + h[i - 1]}, ${x1} ${MID_Y + h[i - 1]}`);
      }
    }

    parts.push("Z");
    return parts.join(" ");
  }

  return (
    // Below roughly 640px the SVG would scale its own text down toward
    // unreadable, so the chart scrolls sideways instead of shrinking.
    <div className="overflow-x-auto">
      <div className="relative mx-auto min-w-[620px] max-w-[880px]">
        <svg
          viewBox={`${-SIDE_PAD} ${-TOP_PAD} ${VB_WIDTH + SIDE_PAD * 2} ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}`}
          className="w-full"
          style={{
            aspectRatio: `${VB_WIDTH + SIDE_PAD * 2} / ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}`,
          }}
          role="img"
          aria-label={`Funil: ${stages.map((s) => `${s.label} ${s.count} (${s.pct}%)`).join(", ")}`}
        >
          {LAYERS.map((layer) => (
            <path
              key={`layer-${layer.offset}`}
              d={bandPath(layer.offset)}
              fill="var(--primary)"
              opacity={layer.opacity}
            />
          ))}

          {stages.map((stage, i) => {
            const cx = centerOf(i);
            const h = halfHeights[i];
            return (
              <g key={`connector-${stage.key}`}>
                {/* Outside the ribbon the connector uses the border colour so
                    it stays visible against the card; inside it switches to the
                    surface colour, reading as a gap cut through the fill. */}
                <line
                  x1={cx}
                  y1={VALUE_PILL_Y + PILL_HEIGHT}
                  x2={cx}
                  y2={MID_Y - h}
                  stroke="var(--border)"
                  strokeWidth={2}
                />
                <line
                  x1={cx}
                  y1={MID_Y - h}
                  x2={cx}
                  y2={MID_Y + h}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
                <line
                  x1={cx}
                  y1={MID_Y + h}
                  x2={cx}
                  y2={LABEL_PILL_Y}
                  stroke="var(--border)"
                  strokeWidth={2}
                />
              </g>
            );
          })}

          {/* Hover targets, one per stage, spanning the full height. */}
          {stages.map((stage, i) => (
            <rect
              key={`hit-${stage.key}`}
              x={i === 0 ? -SIDE_PAD : i * slot}
              y={-TOP_PAD}
              width={slot + (i === 0 || i === count - 1 ? SIDE_PAD : 0)}
              height={VB_HEIGHT + TOP_PAD + BOTTOM_PAD}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            />
          ))}

          {/* Percentage pill, centred in each plateau. */}
          {stages.map((stage, i) => {
            const label = `${stage.pct}%`;
            const width = pillWidth(label, 19, 30);
            return (
              <g key={`pct-${stage.key}`} className="pointer-events-none">
                <rect
                  x={centerOf(i) - width / 2}
                  y={MID_Y - PCT_PILL_HEIGHT / 2}
                  width={width}
                  height={PCT_PILL_HEIGHT}
                  rx={PCT_PILL_HEIGHT / 2}
                  className="fill-foreground"
                />
                <text
                  x={centerOf(i)}
                  y={MID_Y + 6}
                  textAnchor="middle"
                  className="fill-background text-[19px] font-semibold"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Value pill above, stage-name pill below — both on a fixed
              baseline so they line up across stages regardless of band height. */}
          {stages.map((stage, i) => {
            const value = stage.count.toLocaleString("pt-BR");
            const width = pillWidth(value, VALUE_FONT_SIZE, 30);
            return (
              <g key={`value-${stage.key}`} className="pointer-events-none">
                <rect
                  x={centerOf(i) - width / 2}
                  y={VALUE_PILL_Y}
                  width={width}
                  height={PILL_HEIGHT}
                  rx={PILL_HEIGHT / 2}
                  className="fill-card stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={centerOf(i)}
                  y={VALUE_PILL_Y + 22}
                  textAnchor="middle"
                  className="fill-foreground text-[20px] font-semibold"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {stages.map((stage, i) => {
            const width = pillWidth(stage.label, LABEL_FONT_SIZE, 28);
            return (
              <g key={`label-${stage.key}`} className="pointer-events-none">
                <rect
                  x={centerOf(i) - width / 2}
                  y={LABEL_PILL_Y}
                  width={width}
                  height={PILL_HEIGHT}
                  rx={PILL_HEIGHT / 2}
                  className="fill-card stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={centerOf(i)}
                  y={LABEL_PILL_Y + 21}
                  textAnchor="middle"
                  className="fill-foreground text-[16px] font-medium"
                >
                  {stage.label}
                </text>
              </g>
            );
          })}
        </svg>

        {hovered !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-lg"
            style={{
              // Maps an SVG x-coordinate to a percentage of the container,
              // which spans the padded viewBox, not the ribbon's own width.
              left: `${((centerOf(hovered) + SIDE_PAD) / (VB_WIDTH + SIDE_PAD * 2)) * 100}%`,
            }}
          >
            <p className="font-medium">
              {stages[hovered].count.toLocaleString("pt-BR")} · {stages[hovered].label}
            </p>
            {/* The first stage is the funnel's own baseline, so there is no
                preceding step to have dropped off from. */}
            <p className="text-background/70">
              {hovered === 0
                ? "Todos que entraram no funil"
                : `${
                    stages[hovered - 1].count > 0
                      ? Math.round(100 - (stages[hovered].count / stages[hovered - 1].count) * 100)
                      : 0
                  }% de queda vindo de “${stages[hovered - 1].label}”`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
