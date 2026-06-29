/**
 * 色标图例组件
 * 在矩阵底部显示颜色-数值对照条
 */
import { pressureToColor } from "@/lib/analysis";
import { useMemo } from "react";

interface ColorLegendProps {
  min?: number;
  max?: number;
  steps?: number;
  threshold?: number;
}

export default function ColorLegend({
  min = 0,
  max = 255,
  steps = 32,
  threshold = 5,
}: ColorLegendProps) {
  const segments = useMemo(() => {
    const arr: { value: number; color: string }[] = [];
    for (let i = 0; i <= steps; i++) {
      const value = Math.round(min + (max - min) * (i / steps));
      arr.push({ value, color: pressureToColor(value, max) });
    }
    return arr;
  }, [min, max, steps]);

  return (
    <div className="w-full flex items-center gap-2 px-2">
      {/* Min label */}
      <span className="text-[9px] font-mono text-muted-foreground shrink-0 w-5 text-right">
        {min}
      </span>

      {/* Color bar */}
      <div className="flex-1 relative">
        <div className="h-3 rounded-sm overflow-hidden flex">
          {segments.map((seg, i) => (
            <div
              key={i}
              className="flex-1 relative"
              style={{ backgroundColor: seg.color }}
            />
          ))}
        </div>

        {/* Threshold marker */}
        {threshold > min && threshold < max && (
          <div
            className="absolute top-0 h-full"
            style={{
              left: `${((threshold - min) / (max - min)) * 100}%`,
            }}
          >
            <div className="w-px h-full bg-amber-400/80" />
            <div
              className="absolute -bottom-3.5 text-[7px] font-mono text-amber-400/80 whitespace-nowrap"
              style={{ transform: "translateX(-50%)" }}
            >
              T={threshold}
            </div>
          </div>
        )}

        {/* Tick labels */}
        <div className="flex justify-between mt-0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const val = Math.round(min + (max - min) * ratio);
            return (
              <span
                key={ratio}
                className="text-[7px] font-mono text-muted-foreground/50"
              >
                {val}
              </span>
            );
          })}
        </div>
      </div>

      {/* Max label */}
      <span className="text-[9px] font-mono text-muted-foreground shrink-0 w-7 text-left">
        {max}
      </span>
    </div>
  );
}
