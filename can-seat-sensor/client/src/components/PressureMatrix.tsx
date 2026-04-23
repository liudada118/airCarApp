/**
 * Design: Automotive HMI Dark Console
 * 压力矩阵热力图 — 中央主显示区域
 * 自动适应传感器矩阵大小
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
  isValidSensorPosition,
  getDeviceName,
  calculateStats,
  type SensorData,
} from "@/lib/canProtocol";

type ViewMode = "heatmap" | "values" | "3d";

export default function PressureMatrix() {
  const {
    backrestData,
    cushionData,
    activeDevice,
    setActiveDevice,
    adcThreshold,
    connectionStatus,
  } = useCANContext();

  const [viewMode, setViewMode] = useState<ViewMode>("heatmap");
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentData = activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;
  const matrixSize = useMemo(() => getActiveMatrixSize(currentData), [currentData]);
  const stats = useMemo(() => calculateStats(currentData), [currentData]);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";

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
          ? "rgba(15, 20, 35, 0.3)"
          : `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(c * cellW, r * cellH, cellW - 1, cellH - 1);

        // 网格线
        ctx.strokeStyle = "rgba(37, 99, 235, 0.15)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * cellW, r * cellH, cellW - 1, cellH - 1);
      }
    }
  }, [currentData, matrixSize, viewMode, adcThreshold]);

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-3">
          {/* 设备切换 */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-md p-0.5">
            <button
              onClick={() => setActiveDevice(CAN_ID_BACKREST)}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                activeDevice === CAN_ID_BACKREST
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              靠背 0x460
            </button>
            <button
              onClick={() => setActiveDevice(CAN_ID_CUSHION)}
              className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                activeDevice === CAN_ID_CUSHION
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              坐垫 0x461
            </button>
          </div>

          <div className="h-4 w-px bg-border/50" />

          {/* 视图模式 */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-md p-0.5">
            {(["heatmap", "values"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                  viewMode === mode
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "heatmap" ? "压力矩阵" : "ADC数值点阵"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
          <span>
            {matrixSize.rows}x{matrixSize.cols} ({stats.totalCount}有效点)
          </span>
          {isActive && (
            <>
              <span>
                AVG: <span className="text-chart-1">{stats.avg}</span>
              </span>
              <span>
                MAX: <span className="text-destructive">{stats.max}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 矩阵显示区域 */}
      <div className="flex-1 relative overflow-hidden circuit-bg">
        {!isActive ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80">
            <svg className="w-16 h-16 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
              className="relative w-full h-full max-w-[600px] max-h-[600px]"
              style={{ aspectRatio: `${matrixSize.cols} / ${matrixSize.rows}` }}
            >
              <canvas
                ref={canvasRef}
                width={matrixSize.cols * 50}
                height={matrixSize.rows * 50}
                className="w-full h-full rounded-md"
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
                            <span className="text-muted-foreground">{sensorIdToString(((r + 1) << 4) | (c + 1))}</span>
                            <span className="mx-1 text-border">|</span>
                            <span className="text-chart-1 font-semibold">{val}</span>
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
          /* ADC数值点阵视图 */
          <div className="absolute inset-0 p-3 overflow-auto">
            <div
              className="grid gap-0.5 mx-auto"
              style={{
                gridTemplateColumns: `repeat(${matrixSize.cols}, minmax(40px, 1fr))`,
                maxWidth: `${matrixSize.cols * 56}px`,
              }}
            >
              {Array.from({ length: matrixSize.rows }, (_, r) =>
                Array.from({ length: matrixSize.cols }, (_, c) => {
                  const val = currentData.matrix[r]?.[c] ?? -1;
                  const isValid = val >= 0;
                  const color = pressureToColor(val, adcThreshold);
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`
                        flex items-center justify-center h-10 rounded-sm text-xs font-mono
                        transition-colors duration-150 border
                        ${isValid
                          ? "border-primary/10 hover:border-primary/40"
                          : "border-transparent opacity-20"
                        }
                      `}
                      style={{
                        backgroundColor: isValid ? color : "transparent",
                        color: val > 128 ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.9)",
                      }}
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
          <div className="absolute bottom-3 right-3 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded-md px-3 py-1.5 border border-border/50">
            <span className="text-[10px] text-muted-foreground font-mono">0</span>
            <div
              className="w-24 h-2.5 rounded-full"
              style={{
                background: "linear-gradient(to right, #0a1e40, #0e6fa0, #10b981, #f59e0b, #ef4444)",
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">255</span>
          </div>
        )}
      </div>
    </div>
  );
}
