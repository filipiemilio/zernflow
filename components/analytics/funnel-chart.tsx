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
const TOP_PAD = 44;
const BOTTOM_PAD = 60;
// The first and last stage labels are centred on x=0 and x=VB_WIDTH, so half
// of each pill sits outside the band's own width. The viewBox is widened by
// more than the widest half-pill to keep them on canvas.
const SIDE_PAD = 120;

const LABEL_FONT_SIZE = 16;
const LABEL_PILL_HEIGHT = 34;

/** Approximate rendered width of a pill sized to its text. */
function pillWidth(label: string, fontSize: number, padding: number): number {
  return padding + label.length * fontSize * 0.55;
}

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
    // On a narrow screen the SVG would otherwise scale its text down with the
    // container until it is unreadable; a min-width plus horizontal scroll
    // keeps the labels at a legible size instead.
    <div className="overflow-x-auto">
    <div className="relative min-w-[680px]">
      <svg
        viewBox={`${-SIDE_PAD} ${-TOP_PAD} ${VB_WIDTH + SIDE_PAD * 2} ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}`}
        className="w-full"
        style={{
          aspectRatio: `${VB_WIDTH + SIDE_PAD * 2} / ${VB_HEIGHT + TOP_PAD + BOTTOM_PAD}`,
        }}
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

        {/* Hover targets, one per segment, full height so a thin final
            segment is still easy to hit. The outer two stretch into the side
            padding so the hit area matches what the eye reads as the band. */}
        {stages.slice(0, -1).map((stage, i) => {
          const isFirst = i === 0;
          const isLast = i === stages.length - 2;
          return (
            <rect
              key={`hit-${stage.key}`}
              x={isFirst ? -SIDE_PAD : xs[i]}
              y={-TOP_PAD}
              width={segmentWidth + (isFirst ? SIDE_PAD : 0) + (isLast ? SIDE_PAD : 0)}
              height={VB_HEIGHT + TOP_PAD + BOTTOM_PAD}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            />
          );
        })}

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
          const width = 34 + label.length * 13;
          return (
            <g key={`pct-${stage.key}`} className="pointer-events-none">
              <rect
                x={cx - width / 2}
                y={MID_Y - 20}
                width={width}
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

        {/* Stage name pill below each divider, sized to its own text so a
            longer stage name widens the pill instead of spilling out of it. */}
        {stages.map((stage, i) => {
          const width = pillWidth(stage.label, LABEL_FONT_SIZE, 28);
          return (
            <g key={`label-${stage.key}`}>
              <rect
                x={xs[i] - width / 2}
                y={MID_Y + halfHeights[i] + 30}
                width={width}
                height={LABEL_PILL_HEIGHT}
                rx={LABEL_PILL_HEIGHT / 2}
                className="fill-card stroke-border"
                strokeWidth={1}
              />
              <text
                x={xs[i]}
                y={MID_Y + halfHeights[i] + 52}
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
            // Map an SVG x-coordinate to a percentage of the container, which
            // spans the padded viewBox rather than the band's own width.
            left: `${
              ((xs[hovered] + segmentWidth / 2 + SIDE_PAD) / (VB_WIDTH + SIDE_PAD * 2)) * 100
            }%`,
          }}
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
    </div>
  );
}
