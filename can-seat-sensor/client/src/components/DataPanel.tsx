/**
 * Design: Automotive HMI Dark Console
 * 右侧数据分析面板 — 统计信息、批次管理、历史记录
 */
import { useMemo, useState } from "react";
import { useCANContext } from "@/contexts/CANContext";
import {
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  calculateStats,
  getDeviceName,
  canIdToString,
  MATRIX_ROWS,
  MATRIX_COLS,
  isValidSensorPosition,
} from "@/lib/canProtocol";
import {
  BarChart3,
  Activity,
  Layers,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Database,
} from "lucide-react";

interface BatchRecord {
  id: string;
  timestamp: number;
  deviceName: string;
  avgPressure: number;
  maxPressure: number;
  status: "pass" | "fail" | "pending";
}

export default function DataPanel() {
  const {
    backrestData,
    cushionData,
    activeDevice,
    connectionStatus,
    frameRate,
    adcThreshold,
  } = useCANContext();

  const [batchRecords] = useState<BatchRecord[]>([]);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";
  const currentData = activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;
  const stats = useMemo(() => calculateStats(currentData), [currentData]);
  const backrestStats = useMemo(() => calculateStats(backrestData), [backrestData]);
  const cushionStats = useMemo(() => calculateStats(cushionData), [cushionData]);

  // 计算压力分布直方图
  const histogram = useMemo(() => {
    const bins = new Array(10).fill(0);
    for (let r = 0; r < MATRIX_ROWS; r++) {
      for (let c = 0; c < MATRIX_COLS; c++) {
        const val = currentData.matrix[r]?.[c] ?? -1;
        if (val > adcThreshold) {
          const bin = Math.min(9, Math.floor(val / 26));
          bins[bin]++;
        }
      }
    }
    return bins;
  }, [currentData, adcThreshold]);

  const maxBin = Math.max(...histogram, 1);

  return (
    <aside className="w-[280px] min-w-[280px] h-full border-l border-border/50 bg-sidebar flex flex-col overflow-y-auto">
      {!isActive ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">连接设备后</p>
            <p className="text-sm text-muted-foreground">将显示分析数据</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* 实时统计 */}
          <div className="px-3 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide">实时统计</span>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">
                {getDeviceName(activeDevice)} {canIdToString(activeDevice)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <StatCard label="平均值" value={stats.avg} color="text-chart-1" />
              <StatCard label="最大值" value={stats.max} color="text-destructive" />
              <StatCard label="最小值" value={stats.min} color="text-chart-2" />
              <StatCard label="活跃点" value={stats.activeCount} suffix={`/${stats.totalCount}`} color="text-chart-4" />
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">帧率</span>
              <span className="font-mono text-chart-1">{frameRate} fps</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">帧计数</span>
              <span className="font-mono text-foreground/80">{currentData.frameCount}</span>
            </div>
          </div>

          {/* 压力分布直方图 */}
          <div className="px-3 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide">压力分布</span>
            </div>
            <div className="flex items-end gap-0.5 h-16">
              {histogram.map((count, i) => {
                const height = (count / maxBin) * 100;
                const rangeStart = i * 26;
                const rangeEnd = Math.min(255, (i + 1) * 26 - 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className="w-full rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${Math.max(2, height)}%`,
                        background: `linear-gradient(to top, oklch(0.55 0.20 260 / 0.6), oklch(0.72 0.15 195 / 0.8))`,
                      }}
                    />
                    <span className="text-[8px] text-muted-foreground/60 font-mono">
                      {rangeStart}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 双设备概览 */}
          <div className="px-3 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide">设备概览</span>
            </div>
            <div className="space-y-1.5">
              <DeviceOverview
                name="靠背"
                canId="0x460"
                stats={backrestStats}
                isActive={activeDevice === CAN_ID_BACKREST}
                hasData={backrestData.frameCount > 0}
              />
              <DeviceOverview
                name="坐垫"
                canId="0x461"
                stats={cushionStats}
                isActive={activeDevice === CAN_ID_CUSHION}
                hasData={cushionData.frameCount > 0}
              />
            </div>
          </div>

          {/* 批次管理 */}
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold tracking-wide">批次管理</span>
                <span className="text-[10px] text-muted-foreground font-mono tracking-widest">BATCH</span>
              </div>
            </div>
            {batchRecords.length === 0 ? (
              <div className="text-center py-4 bg-card/30 rounded-md border border-border/20">
                <Clock className="w-5 h-5 mx-auto text-muted-foreground/30 mb-1" />
                <p className="text-[11px] text-muted-foreground">暂无批次记录</p>
                <p className="text-[10px] text-muted-foreground/60">连接设备后可开始记录测试数据</p>
              </div>
            ) : (
              <div className="space-y-1">
                {batchRecords.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between bg-card/30 rounded px-2 py-1.5 border border-border/20"
                  >
                    <div className="text-[11px]">
                      <span className="text-foreground/80">{record.deviceName}</span>
                      <span className="text-muted-foreground ml-1.5">
                        AVG:{record.avgPressure}
                      </span>
                    </div>
                    {record.status === "pass" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : record.status === "fail" ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

function StatCard({
  label,
  value,
  suffix,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <div className="bg-card/40 rounded-md border border-border/20 px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-display font-bold ${color}`}>
        {value}
        {suffix && <span className="text-xs text-muted-foreground font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function DeviceOverview({
  name,
  canId,
  stats,
  isActive,
  hasData,
}: {
  name: string;
  canId: string;
  stats: ReturnType<typeof calculateStats>;
  isActive: boolean;
  hasData: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-2 rounded-md border transition-colors ${
        isActive
          ? "bg-primary/5 border-primary/20"
          : "bg-card/30 border-border/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${hasData ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
        <div>
          <div className="text-xs font-medium">{name}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{canId}</div>
        </div>
      </div>
      {hasData ? (
        <div className="text-right">
          <div className="text-xs font-mono text-chart-1">{stats.avg}</div>
          <div className="text-[10px] text-muted-foreground">AVG</div>
        </div>
      ) : (
        <span className="text-[10px] text-muted-foreground">无数据</span>
      )}
    </div>
  );
}
