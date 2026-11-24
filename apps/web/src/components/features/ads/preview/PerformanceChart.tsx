"use client";

import { useId, useState } from "react";
import {
  metricLabels,
  metricText,
  metricValue,
  type Metric,
  type overviewReport,
} from "./previewData";

interface PerformanceChartProps {
  timeline: ReturnType<typeof overviewReport>["timeline"];
}

const metrics: Metric[] = ["revenue", "spend", "purchases", "roas"];
const labels = {
  revenue: "Revenue",
  spend: "Spend",
  purchases: "Purchases",
  roas: "ROAS",
};

export function PerformanceChart({ timeline }: PerformanceChartProps) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const id = useId();
  const current = timeline.current.map((row) => metricValue(metric, row));
  const previous = timeline.previous.map((row) => metricValue(metric, row));
  const peak = Math.max(1, ...current, ...previous);
  const magnitude = 10 ** Math.floor(Math.log10(peak / 4));
  const step = Math.ceil(peak / (4 * magnitude)) * magnitude;
  const points = (values: number[]) =>
    values
      .map(
        (value, index) =>
          `${(index * 640) / (values.length - 1)},${180 - (value * 180) / (4 * step)}`,
      )
      .join(" ");
  const days = current.length;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="min-w-0 rounded-xl border bg-card p-4 sm:p-6"
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold tracking-tight">
        Performance over time
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Compare daily results with the previous period.
      </p>
      <div
        role="group"
        aria-label="Chart metric"
        className="mt-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit"
      >
        {metrics.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={metric === key}
            onClick={() => setMetric(key)}
            className="min-h-9 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
          >
            {labels[key]}
          </button>
        ))}
      </div>
      <div className="mt-5 flex gap-3">
        <div
          aria-hidden="true"
          className="flex h-44 shrink-0 flex-col justify-between text-end text-[10px] tabular-nums text-muted-foreground sm:h-56 sm:text-xs"
        >
          {[4, 3, 2, 1, 0].map((tick) => (
            <span key={tick}>
              {metricText(metric, Number((tick * step).toPrecision(5)))}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox="0 0 640 180"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${metricLabels[metric]} by day, current versus previous ${days} days`}
            className="h-44 w-full overflow-visible sm:h-56"
          >
            <defs>
              <linearGradient id={`${id}-area`} x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity=".16"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0"
                />
              </linearGradient>
            </defs>
            {[0, 45, 90, 135, 180].map((y) => (
              <line
                key={y}
                x1="0"
                x2="640"
                y1={y}
                y2={y}
                className="stroke-border"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon
              points={`0,180 ${points(current)} 640,180`}
              fill={`url(#${id}-area)`}
            />
            <polyline
              points={points(previous)}
              fill="none"
              className="stroke-muted-foreground"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={points(current)}
              fill="none"
              className="stroke-primary"
              strokeWidth="2.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Day 1</span>
            <span>Day {Math.ceil(days / 2)}</span>
            <span>Day {days}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="w-5 border-t-2 border-primary" />
          This period
        </span>
        <span className="flex items-center gap-2">
          <span className="w-5 border-t-2 border-dashed border-muted-foreground" />
          Previous period
        </span>
      </div>
    </section>
  );
}
