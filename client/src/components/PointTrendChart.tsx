/**
 * 单点历史趋势图组件
 * 点击矩阵中某个点位后，展示该点位的ADC值随时间变化的折线图
 */
import { pressureToColor } from "@/lib/analysis";
import { X } from "lucide-react";
import { memo, useEffect, useRef, useMemo } from "react";

interface PointTrendChartProps {
  /** 选中的点位 [row, col] */
  selectedPoint: [number, number] | null;
  /** 历史数据帧 */
  historyFrames: number[][];
  /** 矩阵维度 */
  dim: number;
  /** ADC阈值 */
  adcThreshold: number;
  /** 关闭回调 */
  onClose: () => void;
}

function PointTrendChartInner({
  selectedPoint,
  historyFrames,
  dim,
  adcThreshold,
  onClose,
}: PointTrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 提取选中点位的历史数据
  const pointHistory = useMemo(() => {
    if (!selectedPoint || historyFrames.length === 0) return [];
    const [row, col] = selectedPoint;
    const idx = row * dim + col;
    return historyFrames.map((frame) => frame[idx] ?? 0);
  }, [selectedPoint, historyFrames, dim]);

  // 计算统计量
  const pointStats = useMemo(() => {
    if (pointHistory.length === 0) return { min: 0, max: 0, mean: 0, std: 0, current: 0 };
    const current = pointHistory[pointHistory.length - 1];
    const min = Math.min(...pointHistory);
    const max = Math.max(...pointHistory);
    const mean = pointHistory.reduce((s, v) => s + v, 0) / pointHistory.length;
    const variance = pointHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / pointHistory.length;
    const std = Math.sqrt(variance);
    return { min, max, mean, std, current };
  }, [pointHistory]);

  // 绘制折线图
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedPoint || pointHistory.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 12, bottom: 20, left: 32 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Determine Y range
    const dataMin = Math.max(0, Math.min(...pointHistory) - 10);
    const dataMax = Math.min(255, Math.max(...pointHistory) + 10);
    const yRange = dataMax - dataMin || 1;

    // Grid lines
    ctx.strokeStyle = "rgba(30, 111, 217, 0.12)";
    ctx.lineWidth = 0.5;
    const gridCount = 4;
    for (let i = 0; i <= gridCount; i++) {
      const y = padding.top + (chartH / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = dataMax - (yRange / gridCount) * i;
      ctx.fillStyle = "rgba(100, 160, 220, 0.5)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(0), padding.left - 4, y + 3);
    }

    // X-axis labels
    ctx.fillStyle = "rgba(100, 160, 220, 0.4)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    const xLabels = [0, Math.floor(pointHistory.length / 2), pointHistory.length - 1];
    xLabels.forEach((idx) => {
      if (idx < 0) return;
      const x = padding.left + (idx / Math.max(1, pointHistory.length - 1)) * chartW;
      ctx.fillText(`#${idx}`, x, h - 4);
    });

    // Threshold line
    if (adcThreshold > dataMin && adcThreshold < dataMax) {
      const threshY = padding.top + ((dataMax - adcThreshold) / yRange) * chartH;
      ctx.strokeStyle = "rgba(245, 158, 11, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, threshY);
      ctx.lineTo(w - padding.right, threshY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245, 158, 11, 0.6)";
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`T=${adcThreshold}`, w - padding.right + 2, threshY + 3);
    }

    // Mean line
    const meanY = padding.top + ((dataMax - pointStats.mean) / yRange) * chartH;
    ctx.strokeStyle = "rgba(0, 212, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, meanY);
    ctx.lineTo(w - padding.right, meanY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw line chart
    if (pointHistory.length > 1) {
      // Area fill
      ctx.beginPath();
      pointHistory.forEach((val, i) => {
        const x = padding.left + (i / (pointHistory.length - 1)) * chartW;
        const y = padding.top + ((dataMax - val) / yRange) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(padding.left + chartW, padding.top + chartH);
      ctx.lineTo(padding.left, padding.top + chartH);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, "rgba(30, 111, 217, 0.25)");
      gradient.addColorStop(1, "rgba(30, 111, 217, 0.02)");
      ctx.fillStyle = gradient;
      ctx.fill();

      // Line
      ctx.beginPath();
      pointHistory.forEach((val, i) => {
        const x = padding.left + (i / (pointHistory.length - 1)) * chartW;
        const y = padding.top + ((dataMax - val) / yRange) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#1e6fd9";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Current point (last)
      const lastVal = pointHistory[pointHistory.length - 1];
      const lastX = padding.left + chartW;
      const lastY = padding.top + ((dataMax - lastVal) / yRange) * chartH;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fillStyle = pressureToColor(lastVal);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [pointHistory, selectedPoint, adcThreshold, pointStats.mean]);

  if (!selectedPoint) return null;

  const [row, col] = selectedPoint;

  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      {/* Header */}
      <div className="industrial-panel-header flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-sm border border-white/20"
          style={{ backgroundColor: pressureToColor(pointStats.current) }}
        />
        <span>点位趋势 [{row},{col}]</span>
        <span className="text-[8px] text-muted-foreground/50 ml-auto">Point Trend</span>
        <button
          onClick={onClose}
          className="w-4 h-4 flex items-center justify-center rounded hover:bg-background/50 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="p-2 space-y-2">
        {/* Current value */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">当前值</span>
          <span
            className="text-base font-mono font-bold led-text"
            style={{ color: pressureToColor(pointStats.current) }}
          >
            {pointStats.current}
          </span>
        </div>

        {/* Chart */}
        <div className="bg-background/30 rounded p-1" style={{ height: 100 }}>
          {pointHistory.length > 1 ? (
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ display: "block" }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground/50">
              等待更多数据帧...
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "最小", value: pointStats.min, color: "#3b82f6" },
            { label: "最大", value: pointStats.max, color: "#ef4444" },
            { label: "均值", value: pointStats.mean.toFixed(1), color: "#00d4ff" },
            { label: "标准差", value: pointStats.std.toFixed(2), color: "#a78bfa" },
          ].map((s) => (
            <div key={s.label} className="bg-background/20 rounded px-1.5 py-1 text-center">
              <div className="text-[7px] text-muted-foreground/50">{s.label}</div>
              <div className="text-[9px] font-mono font-semibold" style={{ color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div className="text-[8px] text-muted-foreground/40 text-center">
          采样帧数: {pointHistory.length}
        </div>
      </div>
    </div>
  );
}

const PointTrendChart = memo(PointTrendChartInner);
export default PointTrendChart;
