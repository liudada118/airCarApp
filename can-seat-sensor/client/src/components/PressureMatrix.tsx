/**
 * v2.0 中央矩阵显示区域
 * 压力矩阵热力图 + ADC数值点阵，参考v2.0设计
 */
import { useMemo, useRef, useEffect, useState } from "react";
import { useCANContext } from "@/contexts/CANContext";
import {
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  MATRIX_ROWS,
  MATRIX_COLS,
  TOTAL_SENSOR_COUNT,
  pressureToColor,
  pressureToRGB,
  sensorIdToString,
  getActiveMatrixSize,
  calculateStats,
  type SensorData,
} from "@/lib/canProtocol";
import { Grid3x3, BarChart3 } from "lucide-react";

type ViewMode = "heatmap" | "values";

/** 根据值返回文字颜色，确保可读性 */
function getTextColor(val: number): string {
  if (val < 0) return "transparent";
  // 低值(深蓝) -> 白字, 中值(绿/黄) -> 黑字, 高值(红) -> 白字
  if (val < 60) return "rgba(255,255,255,0.85)";
  if (val < 180) return "rgba(0,0,0,0.75)";
  return "rgba(255,255,255,0.9)";
}

export default function PressureMatrix() {
  const {
    backrestData,
    cushionData,
    activeDevice,
    setActiveDevice,
    adcThreshold,
    connectionStatus,
  } = useCANContext();

  const [viewMode, setViewMode] = useState<ViewMode>("values");
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentData = activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;
  const matrixSize = useMemo(() => getActiveMatrixSize(currentData), [currentData]);
  const stats = useMemo(() => calculateStats(currentData), [currentData]);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";
  const isDemo = connectionStatus === "simulating";

  // Canvas渲染热力图
  useEffect(() => {
    if (viewMode !== "heatmap" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { rows, cols } = matrixSize;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = currentData.matrix[r]?.[c] ?? -1;
        const [red, green, blue] = pressureToRGB(val, adcThreshold);

        ctx.fillStyle = val < 0
          ? "rgba(240, 240, 245, 0.3)"
          : `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * cellW, r * cellH, cellW - 0.5, cellH - 0.5);
      }
    }
  }, [currentData, matrixSize, viewMode, adcThreshold]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* 视图模式切换 */}
          <div className="flex items-center gap-0.5 text-xs">
            <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            <button
              onClick={() => setViewMode("heatmap")}
              className={`px-2 py-1 rounded transition-colors ${
                viewMode === "heatmap"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              压力矩阵
            </button>
            <span className="text-muted-foreground/40">·</span>
            <button
              onClick={() => setViewMode("values")}
              className={`px-2 py-1 rounded transition-colors ${
                viewMode === "values"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ADC数值点阵
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 过滤标签 */}
          {adcThreshold > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-primary/10 text-primary border border-primary/20">
              过滤: ADC&gt;{adcThreshold}
            </span>
          )}
          {/* Demo标签 */}
          {isDemo && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-warning/15 text-warning border border-warning/20">
              DEMO MODE
            </span>
          )}
          {/* Live标签 */}
          {isActive && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-success/15 text-success border border-success/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success status-pulse" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* 设备切换标签 */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-card">
        <button
          onClick={() => setActiveDevice(CAN_ID_BACKREST)}
          className={`px-3 py-1 text-xs font-medium rounded transition-all ${
            activeDevice === CAN_ID_BACKREST
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          靠背 0x460
        </button>
        <button
          onClick={() => setActiveDevice(CAN_ID_CUSHION)}
          className={`px-3 py-1 text-xs font-medium rounded transition-all ${
            activeDevice === CAN_ID_CUSHION
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          坐垫 0x461
        </button>
        <div className="ml-auto text-[11px] text-muted-foreground font-mono">
          {matrixSize.rows}x{matrixSize.cols} ({stats.totalCount}有效点)
          {isActive && (
            <>
              {" · "}AVG: <span className="text-primary font-medium">{stats.avg}</span>
              {" · "}MAX: <span className="text-destructive font-medium">{stats.max}</span>
            </>
          )}
        </div>
      </div>

      {/* 矩阵显示区域 */}
      <div className="flex-1 relative overflow-hidden bg-muted/30">
        {!isActive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <svg className="w-16 h-16 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18M3 9h18" />
            </svg>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">等待设备连接</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                连接CAN设备或点击"模拟数据"查看演示
              </p>
            </div>
          </div>
        ) : viewMode === "heatmap" ? (
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div
              className="relative w-full h-full max-w-[560px] max-h-[560px]"
              style={{ aspectRatio: `${matrixSize.cols} / ${matrixSize.rows}` }}
            >
              <canvas
                ref={canvasRef}
                width={matrixSize.cols * 50}
                height={matrixSize.rows * 50}
                className="w-full h-full rounded"
                style={{ imageRendering: "pixelated" }}
              />
              {/* 悬停交互层 */}
              <div
                className="absolute inset-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${matrixSize.cols}, 1fr)`,
                  gridTemplateRows: `repeat(${matrixSize.rows}, 1fr)`,
                }}
              >
                {Array.from({ length: matrixSize.rows }, (_, r) =>
                  Array.from({ length: matrixSize.cols }, (_, c) => {
                    const val = currentData.matrix[r]?.[c] ?? -1;
                    const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className="relative cursor-crosshair"
                        onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {isHovered && val >= 0 && (
                          <div className="absolute z-50 -top-10 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-xs font-mono whitespace-nowrap shadow-lg">
                            <span className="text-muted-foreground">[{r},{c}]</span>
                            <span className="mx-1 text-border">|</span>
                            <span className="text-primary font-semibold">{val}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ADC数值点阵视图 — v2.0 风格 */
          <div className="absolute inset-0 p-2 overflow-auto">
            <div
              className="grid gap-px mx-auto"
              style={{
                gridTemplateColumns: `repeat(${matrixSize.cols}, minmax(36px, 1fr))`,
                maxWidth: `${matrixSize.cols * 48}px`,
              }}
            >
              {Array.from({ length: matrixSize.rows }, (_, r) =>
                Array.from({ length: matrixSize.cols }, (_, c) => {
                  const val = currentData.matrix[r]?.[c] ?? -1;
                  const isValid = val >= 0;
                  const filtered = isValid && val <= adcThreshold;
                  const color = pressureToColor(val, adcThreshold);
                  const textColor = getTextColor(val);
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`
                        flex items-center justify-center h-[30px] text-[11px] font-mono
                        transition-colors duration-100
                        ${!isValid ? "opacity-10" : filtered ? "opacity-40" : ""}
                      `}
                      style={{
                        backgroundColor: isValid ? color : "transparent",
                        color: textColor,
                      }}
                      onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={isValid ? `[${r},${c}] = ${val}` : ""}
                    >
                      {isValid ? val : ""}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 色标 */}
        {isActive && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/95 backdrop-blur-sm rounded-md px-3 py-1.5 border border-border shadow-sm">
            <span className="text-[10px] text-muted-foreground font-mono">0</span>
            <div
              className="w-40 h-3 rounded-sm"
              style={{
                background: "linear-gradient(to right, #0a1e40, #0e6fa0, #10b981, #f59e0b, #ef4444)",
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">255</span>
          </div>
        )}

        {/* 悬停信息浮窗 (values模式) */}
        {viewMode === "values" && hoveredCell && isActive && (
          <div className="absolute top-2 right-2 bg-card border border-border rounded-md px-3 py-2 shadow-md text-xs font-mono">
            <div className="text-muted-foreground">
              位置: [{hoveredCell.row}, {hoveredCell.col}]
            </div>
            <div className="text-foreground font-semibold mt-0.5">
              ADC: {currentData.matrix[hoveredCell.row]?.[hoveredCell.col] ?? "N/A"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
