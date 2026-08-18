"use client";

import { useState } from "react";
import type { FunnelStage } from "@/lib/flow-analytics";

// Fixed viewBox coordinate space; the SVG scales to its container via
// width/height 100% and preserveAspectRatio, so these are logical units,
// not pixels.
const VB_WIDTH = 1000;
const VB_HEIGHT = 360;
const MID_Y = VB_HEIGHT / 2;
const MAX_HALF_HEIGHT = 150;
const TOP_PAD = 40;
const BOTTOM_PAD = 40;

/** One smooth S-curve taper between two adjacent stage boundaries. */
function segmentPath(
  x0: number,
  x1: number,
  halfHeight0: number,
  halfHeight1: number,
): string {
  const midX = x0 + (x1 - x0) / 2;
  const top0 = MID_Y - halfHeight0;
  const top1 = MID_Y - halfHeight1;
  const bottom0 = MID_Y + halfHeight0;
  const bottom1 = MID_Y + halfHeight1;
  return [
    `M ${x0} ${top0}`,
    `C ${midX} ${top0}, ${midX} ${top1}, ${x1} ${top1}`,
    `L ${x1} ${bottom1}`,
    `C ${midX} ${bottom1}, ${midX} ${bottom0}, ${x0} ${bottom0}`,
    "Z",
  ].join(" ");
}

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (stages.length < 2) return null;

  const segmentWidth = VB_WIDTH / (stages.length - 1);
  const xs = stages.map((_, i) => i * segmentWidth);
  const halfHeights = stages.map((s) => (s.pct / 100) * MAX_HALF_HEIGHT);

  return (
    <div className="relative">
      <svg
        viewBox={`0 -${TOP_PAD} ${VB_WIDTH} ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}`}
        className="w-full"
        style={{ aspectRatio: `${VB_WIDTH} / ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}` }}
        role="img"
        aria-label={`Funil: ${stages.map((s) => `${s.label} ${s.pct}%`).join(", ")}`}
      >
        {/* Soft halo, a wash of the same hue behind the solid band — same
            shape at extra height, never a second data-bearing mark. */}
        {stages.slice(0, -1).map((stage, i) => (
          <path
            key={`halo-${stage.key}`}
            d={segmentPath(
              xs[i],
              xs[i + 1],
              halfHeights[i] + 22,
              halfHeights[i + 1] + 22,
            )}
            fill="var(--primary)"
            opacity={0.12}
          />
        ))}

        {/* The solid band — the actual mark, one hue throughout. */}
        {stages.slice(0, -1).map((stage, i) => (
          <path
            key={`band-${stage.key}`}
            d={segmentPath(xs[i], xs[i + 1], halfHeights[i], halfHeights[i + 1])}
            fill="var(--primary)"
            opacity={hovered !== null && hovered !== i ? 0.55 : 1}
            className="transition-opacity"
          />
        ))}

        {/* Hover targets, one per segment, wider than the visible band so a
            thin final segment is still easy to hit. */}
        {stages.slice(0, -1).map((stage, i) => (
          <rect
            key={`hit-${stage.key}`}
            x={xs[i]}
            y={-TOP_PAD}
            width={segmentWidth}
            height={VB_HEIGHT + TOP_PAD + BOTTOM_PAD}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="cursor-pointer"
          />
        ))}

        {/* Divider lines in the surface color — the gap that separates
            touching segments, not a stroke drawn on the data. */}
        {xs.map((x, i) => (
          <line
            key={`divider-${stages[i].key}`}
            x1={x}
            y1={MID_Y - halfHeights[i] - 26}
            x2={x}
            y2={MID_Y + halfHeights[i] + 26}
            stroke="var(--card)"
            strokeWidth={3}
          />
        ))}

        {/* Value label above each divider. */}
        {stages.map((stage, i) => (
          <text
            key={`value-${stage.key}`}
            x={xs[i]}
            y={MID_Y - halfHeights[i] - 40}
            textAnchor="middle"
            className="fill-foreground text-[26px] font-semibold"
          >
            {stage.count.toLocaleString("pt-BR")}
          </text>
        ))}

        {/* Percentage pill centered in each segment. */}
        {stages.slice(0, -1).map((stage, i) => {
          const cx = xs[i] + segmentWidth / 2;
          const label = `${stage.pct}%`;
          const pillWidth = 34 + label.length * 13;
          return (
            <g key={`pct-${stage.key}`} className="pointer-events-none">
              <rect
                x={cx - pillWidth / 2}
                y={MID_Y - 20}
                width={pillWidth}
                height={40}
                rx={20}
                className="fill-foreground"
              />
              <text
                x={cx}
                y={MID_Y + 7}
                textAnchor="middle"
                className="fill-background text-[20px] font-semibold"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Stage name pill below each divider. */}
        {stages.map((stage, i) => (
          <g key={`label-${stage.key}`}>
            <rect
              x={xs[i] - 90}
              y={MID_Y + halfHeights[i] + 34}
              width={180}
              height={34}
              rx={17}
              className="fill-card stroke-border"
              strokeWidth={1}
            />
            <text
              x={xs[i]}
              y={MID_Y + halfHeights[i] + 57}
              textAnchor="middle"
              className="fill-foreground text-[16px] font-medium"
            >
              {stage.label}
            </text>
          </g>
        ))}
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-lg"
          style={{ left: `${((xs[hovered] + segmentWidth / 2) / VB_WIDTH) * 100}%` }}
        >
          <p className="font-medium">
            {stages[hovered].count.toLocaleString("pt-BR")} → {stages[hovered + 1].count.toLocaleString("pt-BR")}
          </p>
          <p className="text-background/70">
            {stages[hovered].label} → {stages[hovered + 1].label}
            {" · "}
            {stages[hovered].count > 0
              ? Math.round(
                  100 -
                    (stages[hovered + 1].count / stages[hovered].count) * 100,
                )
              : 0}
            % de queda
          </p>
        </div>
      )}
    </div>
  );
}
