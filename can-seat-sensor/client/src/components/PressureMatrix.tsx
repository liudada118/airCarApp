/**
 * 中央矩阵显示区域
 * 压力矩阵热力图 + ADC数值点阵
 * 自动识别有效传感器区域并自适应显示
 */
import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { useCANContext } from "@/contexts/CANContext";
import {
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  pressureToColor,
  pressureToRGB,
  getTextColorForValue,
  detectActiveRegion,
  extractSubMatrix,
  calculateStats,
  formatMatrixSize,
  type ActiveRegion,
} from "@/lib/canProtocol";
import { Grid3x3 } from "lucide-react";

type ViewMode = "heatmap" | "values";

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
  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
    value: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentData =
    activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;

  const isActive =
    connectionStatus === "connected" || connectionStatus === "simulating";
  const isDemo = connectionStatus === "simulating";

  // 检测有效区域
  const region: ActiveRegion = useMemo(
    () => detectActiveRegion(currentData),
    [currentData]
  );

  // 提取子矩阵
  const subMatrix = useMemo(
    () => (isActive ? extractSubMatrix(currentData, region) : []),
    [currentData, region, isActive]
  );

  // 统计数据（只统计有效区域）
  const stats = useMemo(
    () => calculateStats(currentData, isActive ? region : undefined),
    [currentData, region, isActive]
  );

  const displayRows = isActive ? region.rows : 0;
  const displayCols = isActive ? region.cols : 0;
  const totalPoints = displayRows * displayCols;

  // Canvas渲染热力图
  useEffect(() => {
    if (viewMode !== "heatmap" || !canvasRef.current || !isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rows = subMatrix.length;
    const cols = rows > 0 ? subMatrix[0].length : 0;
    if (rows === 0 || cols === 0) return;

    canvas.width = cols * 60;
    canvas.height = rows * 60;
    const cellW = canvas.width / cols;
    const cellH = canvas.height / rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = subMatrix[r]?.[c] ?? -1;
        if (val < 0) {
          ctx.fillStyle = "rgba(240, 240, 245, 0.15)";
        } else {
          const [red, green, blue] = pressureToRGB(val, adcThreshold);
          ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        }
        ctx.fillRect(c * cellW, r * cellH, cellW - 0.5, cellH - 0.5);
      }
    }
  }, [subMatrix, viewMode, adcThreshold, isActive]);

  const handleCellHover = useCallback(
    (r: number, c: number, val: number) => {
      setHoveredCell({ row: r, col: c, value: val });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-0.5 text-xs">
          <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground mr-1.5" />
          <button
            onClick={() => setViewMode("heatmap")}
            className={`px-2.5 py-1 rounded transition-colors ${
              viewMode === "heatmap"
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            压力矩阵
          </button>
          <span className="text-muted-foreground/30">·</span>
          <button
            onClick={() => setViewMode("values")}
            className={`px-2.5 py-1 rounded transition-colors ${
              viewMode === "values"
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ADC数值点阵
          </button>
        </div>

        <div className="flex items-center gap-2">
          {adcThreshold > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-primary/10 text-primary border border-primary/20">
              过滤: ADC&gt;{adcThreshold}
            </span>
          )}
          {isDemo && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
              DEMO MODE
            </span>
          )}
          {isActive && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* 设备切换 + 矩阵信息 */}
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
          {isActive ? (
            <>
              {formatMatrixSize(region)}（{totalPoints}有效点）
              {" · "}AVG:{" "}
              <span className="text-primary font-medium">{stats.avg}</span>
              {" · "}MAX:{" "}
              <span className="text-red-500 font-medium">{stats.max}</span>
            </>
          ) : (
            "等待数据..."
          )}
        </div>
      </div>

      {/* 矩阵显示区域 */}
      <div className="flex-1 relative overflow-hidden bg-muted/20">
        {!isActive ? (
          /* 空状态 */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <svg
              className="w-14 h-14 text-muted-foreground/20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            >
              <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18M3 9h18" />
            </svg>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">等待设备连接</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                连接CAN设备或点击&ldquo;模拟数据&rdquo;查看演示
              </p>
            </div>
          </div>
        ) : viewMode === "heatmap" ? (
          /* 热力图视图 */
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div
              className="relative"
              style={{
                width: "100%",
                maxWidth: `${Math.min(560, displayCols * 80)}px`,
                aspectRatio: `${displayCols} / ${displayRows}`,
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full rounded"
                style={{ imageRendering: "pixelated" }}
              />
              {/* 悬停交互层 */}
              <div
                className="absolute inset-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${displayCols}, 1fr)`,
                  gridTemplateRows: `repeat(${displayRows}, 1fr)`,
                }}
              >
                {subMatrix.map((row, r) =>
                  row.map((val, c) => (
                    <div
                      key={`h-${r}-${c}`}
                      className="relative cursor-crosshair"
                      onMouseEnter={() => handleCellHover(r, c, val)}
                      onMouseLeave={handleCellLeave}
                    >
                      {hoveredCell?.row === r &&
                        hoveredCell?.col === c &&
                        val >= 0 && (
                          <div className="absolute z-50 -top-9 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-2 py-1 text-xs font-mono whitespace-nowrap shadow-md">
                            <span className="text-muted-foreground">
                              [{r + region.startRow},{c + region.startCol}]
                            </span>
                            <span className="mx-1 text-border">|</span>
                            <span className="text-primary font-semibold">
                              {val}
                            </span>
                          </div>
                        )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ADC数值点阵视图 */
          <div className="absolute inset-0 flex items-center justify-center p-3">
            <div
              className="grid gap-px"
              style={{
                gridTemplateColumns: `repeat(${displayCols}, minmax(40px, 1fr))`,
                maxWidth: `${displayCols * 56}px`,
                width: "100%",
              }}
            >
              {subMatrix.map((row, r) =>
                row.map((val, c) => {
                  const isValid = val >= 0;
                  const filtered = isValid && val <= adcThreshold;
                  const bgColor = pressureToColor(val, adcThreshold);
                  const txtColor = getTextColorForValue(val, adcThreshold);
                  const isHovered =
                    hoveredCell?.row === r && hoveredCell?.col === c;

                  return (
                    <div
                      key={`v-${r}-${c}`}
                      className={`
                        flex items-center justify-center
                        text-[12px] font-mono leading-none
                        transition-all duration-75
                        ${!isValid ? "opacity-5" : filtered ? "opacity-30" : ""}
                        ${isHovered && isValid ? "ring-2 ring-primary/60 z-10 scale-110" : ""}
                      `}
                      style={{
                        backgroundColor: isValid ? bgColor : "transparent",
                        color: txtColor,
                        height: `${Math.max(32, Math.min(48, 320 / displayRows))}px`,
                      }}
                      onMouseEnter={() =>
                        handleCellHover(r, c, val)
                      }
                      onMouseLeave={handleCellLeave}
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
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-card/90 backdrop-blur-sm rounded px-3 py-1 border border-border/60 shadow-sm">
            <span className="text-[10px] text-muted-foreground font-mono">
              0
            </span>
            <div
              className="w-32 h-2.5 rounded-sm"
              style={{
                background:
                  "linear-gradient(to right, #0a1e50, #0e6fa0, #10b981, #f59e0b, #ef4444)",
              }}
            />
            <span className="text-[10px] text-muted-foreground font-mono">
              255
            </span>
          </div>
        )}

        {/* 悬停详情 */}
        {hoveredCell && isActive && (
          <div className="absolute top-2 right-2 bg-card border border-border rounded px-3 py-2 shadow-sm text-xs font-mono">
            <div className="text-muted-foreground">
              位置: S
              {(hoveredCell.row + region.startRow + 1)
                .toString(16)
                .toUpperCase()}
              {(hoveredCell.col + region.startCol + 1)
                .toString(16)
                .toUpperCase()}
              {" "}[{hoveredCell.row + region.startRow},{hoveredCell.col + region.startCol}]
            </div>
            <div className="text-foreground font-semibold mt-0.5">
              ADC: {hoveredCell.value >= 0 ? hoveredCell.value : "N/A"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
