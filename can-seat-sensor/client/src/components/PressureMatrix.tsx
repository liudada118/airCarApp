/**
 * 中央矩阵显示区域
 * ADC数值点阵 — 使用累积记忆自动识别有效传感器区域并自适应填满显示
 *
 * 核心逻辑：
 * - 未按压时：所有位置值为0，显示完整10×10矩阵
 * - 按压后：通过 ActiveSensorTracker 累积记忆非零位置
 * - 自动裁剪到包含所有有效传感器的最小矩形
 * - 无论5×5传感器接在10×10矩阵的哪些位置，都能正确识别和显示
 */
import { useMemo, useState, useCallback } from "react";
import { useCANContext } from "@/contexts/CANContext";
import {
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  pressureToColor,
  getTextColorForValue,
  calculateStats,
  formatMatrixSize,
  extractSubMatrix,
  MAX_MATRIX_ROWS,
  MAX_MATRIX_COLS,
  type ActiveRegion,
} from "@/lib/canProtocol";
import { Grid3x3, Scan, Maximize2 } from "lucide-react";

export default function PressureMatrix() {
  const {
    backrestData,
    cushionData,
    activeDevice,
    setActiveDevice,
    adcThreshold,
    connectionStatus,
    backrestTrackedRegion,
    cushionTrackedRegion,
    hasDiscoveredSensors,
  } = useCANContext();

  const [hoveredCell, setHoveredCell] = useState<{
    row: number;
    col: number;
    value: number;
  } | null>(null);

  const currentData =
    activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;

  const trackedRegion =
    activeDevice === CAN_ID_BACKREST
      ? backrestTrackedRegion
      : cushionTrackedRegion;

  const isActive =
    connectionStatus === "connected" || connectionStatus === "simulating";
  const isDemo = connectionStatus === "simulating";

  // 使用追踪器提供的区域（累积记忆）
  // 如果尚未发现有效传感器，显示完整10×10矩阵
  const region: ActiveRegion = trackedRegion;

  // 提取子矩阵（根据追踪到的区域裁剪）
  const subMatrix = useMemo(
    () => (isActive ? extractSubMatrix(currentData, region) : []),
    [currentData, region, isActive]
  );

  // 统计数据
  const stats = useMemo(
    () => calculateStats(currentData, isActive ? region : undefined),
    [currentData, region, isActive]
  );

  const displayRows = isActive ? region.rows : 0;
  const displayCols = isActive ? region.cols : 0;
  const totalPoints = displayRows * displayCols;

  const handleCellHover = useCallback(
    (r: number, c: number, val: number) => {
      setHoveredCell({ row: r, col: c, value: val });
    },
    []
  );

  const handleCellLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  // 是否已自动裁剪（区域小于10×10）
  const isCropped = region.rows < MAX_MATRIX_ROWS || region.cols < MAX_MATRIX_COLS;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-1.5 text-xs">
          <Grid3x3 className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">ADC数值点阵</span>
        </div>

        <div className="flex items-center gap-2">
          {/* 自动识别状态指示 */}
          {isActive && hasDiscoveredSensors && isCropped && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
              <Scan className="w-3 h-3" />
              自动识别 {region.rows}×{region.cols}
            </span>
          )}
          {isActive && !hasDiscoveredSensors && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center gap-1">
              <Maximize2 className="w-3 h-3" />
              等待按压识别
            </span>
          )}
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
              {formatMatrixSize(region)}（{totalPoints}点）
              {isCropped && (
                <span className="text-blue-500 ml-1">
                  [起始:{region.startRow + 1},{region.startCol + 1}]
                </span>
              )}
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

      {/* ADC数值点阵 — 填满整个中央区域 */}
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
        ) : (
          /* ADC数值点阵 — 网格填满容器 */
          <div className="absolute inset-0 p-1">
            <div
              className="w-full h-full grid gap-px"
              style={{
                gridTemplateColumns: `repeat(${displayCols}, 1fr)`,
                gridTemplateRows: `repeat(${displayRows}, 1fr)`,
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
                        font-mono leading-none select-none
                        transition-all duration-75
                        ${!isValid ? "opacity-5" : filtered ? "opacity-30" : ""}
                        ${isHovered && isValid ? "ring-2 ring-primary/60 z-10 scale-105" : ""}
                      `}
                      style={{
                        backgroundColor: isValid ? bgColor : "transparent",
                        color: txtColor,
                        fontSize: displayRows <= 5 ? "16px" : displayRows <= 10 ? "12px" : "10px",
                      }}
                      onMouseEnter={() => handleCellHover(r, c, val)}
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
