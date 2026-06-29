/**
 * 压力矩阵数值点阵组件
 * 设计风格: 深空控制台 - 航天级暗色工业监控
 * 每个点位直接显示ADC数值，背景色按压力值着色
 * 全覆盖中间区域
 */
import { pressureToColor } from "@/lib/analysis";
import type { MatrixSize } from "@/lib/serial-service";
import ColorLegend from "@/components/ColorLegend";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PressureMatrixProps {
  data: number[];
  matrixSize: MatrixSize;
  adcThreshold?: number;
  selectedPoint?: [number, number] | null;
  highlightPoint?: [number, number] | null;
  onPointClick?: (row: number, col: number) => void;
}

function getDim(size: MatrixSize): number {
  switch (size) {
    case "5x5": return 5;
    case "10x10": return 10;
    case "16x16": return 16;
    case "32x32": return 32;
  }
}

/**
 * 根据背景色亮度决定文字颜色
 */
function getTextColor(value: number): string {
  if (value < 5) return "rgba(60, 80, 120, 0.6)";
  if (value < 40) return "rgba(160, 200, 255, 0.9)";
  if (value < 120) return "rgba(255, 255, 255, 0.95)";
  if (value < 200) return "rgba(0, 0, 0, 0.85)";
  return "rgba(255, 255, 255, 0.95)";
}

/**
 * 使用Canvas渲染的高性能压力矩阵
 */
function PressureMatrixInner({
  data,
  matrixSize,
  adcThreshold = 5,
  selectedPoint,
  highlightPoint,
  onPointClick,
}: PressureMatrixProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: 500 });
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number; x: number; y: number } | null>(null);

  const dim = getDim(matrixSize);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate cell dimensions
  const cellW = containerSize.width / dim;
  const cellH = containerSize.height / dim;

  // Canvas rendering - much faster than 1024 DOM nodes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerSize.width;
    const h = containerSize.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const cW = w / dim;
    const cH = h / dim;

    // Font size based on cell size
    let fontSize: number;
    if (dim <= 10) fontSize = Math.max(10, Math.min(18, Math.min(cW, cH) * 0.4));
    else if (dim <= 16) fontSize = Math.max(8, Math.min(14, Math.min(cW, cH) * 0.38));
    else fontSize = Math.max(6, Math.min(11, Math.min(cW, cH) * 0.36));

    ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw cells
    for (let idx = 0; idx < dim * dim; idx++) {
      const value = data[idx] ?? 0;
      const row = Math.floor(idx / dim);
      const col = idx % dim;
      const x = col * cW;
      const y = row * cH;

      // Background
      if (value > adcThreshold) {
        ctx.fillStyle = pressureToColor(value);
      } else {
        ctx.fillStyle = "rgba(8, 12, 30, 0.9)";
      }
      ctx.fillRect(x, y, cW - 1, cH - 1);

      // Selected point highlight
      if (selectedPoint && selectedPoint[0] === row && selectedPoint[1] === col) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, cW - 3, cH - 3);
      }

      // Auto-test target point highlight (red frame, slightly larger)
      if (highlightPoint && highlightPoint[0] === row && highlightPoint[1] === col) {
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(x, y, cW - 1, cH - 1);
        ctx.setLineDash([]);
      }

      // Text (only show if above threshold)
      if (value > adcThreshold) {
        ctx.fillStyle = getTextColor(value);
        ctx.fillText(String(value), x + cW / 2, y + cH / 2);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = "rgba(30, 111, 217, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < dim; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cW, 0);
      ctx.lineTo(i * cW, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cH);
      ctx.lineTo(w, i * cH);
      ctx.stroke();
    }

    // Row labels
    const labelFontSize = Math.max(7, Math.min(9, cH * 0.3));
    ctx.font = `400 ${labelFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "rgba(100, 160, 220, 0.5)";
    ctx.textAlign = "left";
    for (let row = 0; row < dim; row++) {
      const showLabel = dim <= 10 || (dim <= 16 ? row % 2 === 0 : row % 4 === 0);
      if (showLabel) {
        ctx.fillText(String(row), 2, row * cH + cH / 2);
      }
    }

    // Column labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let col = 0; col < dim; col++) {
      const showLabel = dim <= 10 || (dim <= 16 ? col % 2 === 0 : col % 4 === 0);
      if (showLabel) {
        ctx.fillText(String(col), col * cW + cW / 2, 2);
      }
    }
  }, [data, dim, adcThreshold, selectedPoint, highlightPoint, containerSize]);

  // Mouse event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (row >= 0 && row < dim && col >= 0 && col < dim) {
      setHoveredCell({ row, col, x: e.clientX, y: e.clientY });
    } else {
      setHoveredCell(null);
    }
  }, [cellW, cellH, dim]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onPointClick) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (row >= 0 && row < dim && col >= 0 && col < dim) {
      onPointClick(row, col);
    }
  }, [cellW, cellH, dim, onPointClick]);

  // Hovered cell tooltip data
  const hoveredValue = hoveredCell ? (data[hoveredCell.row * dim + hoveredCell.col] ?? 0) : 0;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden select-none">
      {/* Matrix area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
        {/* Hover tooltip */}
        {hoveredCell && (
          <div
            className="absolute z-50 pointer-events-none"
            style={{
              left: hoveredCell.col * cellW + cellW / 2,
              top: hoveredCell.row * cellH - 4,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div
              className="px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap"
              style={{
                backgroundColor: "rgba(8, 12, 30, 0.95)",
                border: "1px solid #00d4ff",
                color: "#00d4ff",
                boxShadow: "0 0 8px rgba(0, 212, 255, 0.3)",
              }}
            >
              [{hoveredCell.row},{hoveredCell.col}] = {hoveredValue}{hoveredValue <= adcThreshold ? " (已过滤)" : ""}
            </div>
          </div>
        )}
      </div>

      {/* Color Legend Bar */}
      <div className="h-9 shrink-0 flex items-center border-t border-border bg-card/60 backdrop-blur-sm">
        <ColorLegend min={0} max={255} steps={48} threshold={adcThreshold} />
      </div>
    </div>
  );
}

const PressureMatrix = memo(PressureMatrixInner);
export default PressureMatrix;
