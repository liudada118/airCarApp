/**
 * v2.0 右侧面板 — 验收判定 + 核心指标评分 + 均匀性分析
 * 参考原系统的 ACCEPTANCE / ISO 9725 评分设计
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
} from "@/lib/canProtocol";
import {
  ShieldCheck,
  ShieldX,
  Target,
  Activity,
  TrendingUp,
  Settings,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Eye,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

/** 计算均匀性 RSD (相对标准差) */
function calcRSD(data: number[][]): number {
  const vals: number[] = [];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r]?.length ?? 0); c++) {
      const v = data[r][c];
      if (v > 0) vals.push(v);
    }
  }
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (mean === 0) return 0;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return (Math.sqrt(variance) / mean) * 100;
}

/** 计算重复性 eR (多帧间变异) — 简化版 */
function calcRepeatability(data: number[][]): number {
  // 简化：基于当前帧内相邻传感器差异
  const diffs: number[] = [];
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r]?.length ?? 0) - 1; c++) {
      const a = data[r][c], b = data[r][c + 1];
      if (a > 0 && b > 0) diffs.push(Math.abs(a - b));
    }
  }
  if (diffs.length === 0) return 0;
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const max = Math.max(...diffs);
  return max > 0 ? (mean / max) * 100 : 0;
}

/** 计算一致性评分 */
function calcConsistencyScore(rsd: number, repeatability: number): number {
  // 0-100分，RSD越低、重复性越高分数越高
  const rsdScore = Math.max(0, 100 - rsd * 1.5);
  const repScore = repeatability;
  return Math.round((rsdScore * 0.6 + repScore * 0.4));
}

/** 计算活跃点比率 */
function calcActiveRatio(data: number[][], threshold: number): number {
  let total = 0, active = 0;
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r]?.length ?? 0); c++) {
      if (data[r][c] >= 0) {
        total++;
        if (data[r][c] > threshold) active++;
      }
    }
  }
  return total > 0 ? (active / total) * 100 : 0;
}

/** 验收规则 */
interface AcceptanceRule {
  name: string;
  check: (rsd: number, rep: number, consistency: number, activeRatio: number) => boolean;
}

const DEFAULT_RULES: AcceptanceRule[] = [
  { name: "均匀性 RSD < 50%", check: (rsd) => rsd < 50 },
  { name: "重复性 eR > 30%", check: (_, rep) => rep > 30 },
  { name: "一致性评分 > 40", check: (_, __, c) => c > 40 },
  { name: "活跃点比率 > 60%", check: (_, __, ___, ar) => ar > 60 },
];

export default function DataPanel() {
  const {
    backrestData,
    cushionData,
    activeDevice,
    connectionStatus,
    adcThreshold,
    frameRate,
    frameCount,
  } = useCANContext();

  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [acceptanceOpen, setAcceptanceOpen] = useState(true);
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [uniformityOpen, setUniformityOpen] = useState(true);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";
  const isDemo = connectionStatus === "simulating";
  const currentData = activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;
  const stats = useMemo(() => calculateStats(currentData), [currentData]);

  // 核心指标
  const rsd = useMemo(() => calcRSD(currentData.matrix), [currentData]);
  const repeatability = useMemo(() => calcRepeatability(currentData.matrix), [currentData]);
  const consistency = useMemo(() => calcConsistencyScore(rsd, repeatability), [rsd, repeatability]);
  const activeRatio = useMemo(() => calcActiveRatio(currentData.matrix, adcThreshold), [currentData, adcThreshold]);

  // 验收判定
  const ruleResults = useMemo(() => {
    return DEFAULT_RULES.map((rule) => ({
      ...rule,
      passed: rule.check(rsd, repeatability, consistency, activeRatio),
    }));
  }, [rsd, repeatability, consistency, activeRatio]);

  const passedCount = ruleResults.filter((r) => r.passed).length;
  const totalRules = ruleResults.length;
  const isAccepted = passedCount === totalRules;

  return (
    <aside className="w-[300px] min-w-[300px] h-full border-l border-border bg-background flex flex-col overflow-y-auto">
      {!isActive ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <Activity className="w-12 h-12 text-muted-foreground/20" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">连接设备后</p>
            <p className="text-sm text-muted-foreground">将显示分析数据</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* 验收判定 */}
          <Collapsible open={acceptanceOpen} onOpenChange={setAcceptanceOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-accent/30 transition-colors border-b border-border">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold">验收判定</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono tracking-widest">ACCEPTANCE</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${acceptanceOpen ? "" : "-rotate-90"}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 border-b border-border space-y-3">
                {/* 总判定结果 */}
                <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                  isAccepted
                    ? "bg-success/5 border-success/20"
                    : "bg-destructive/5 border-destructive/20"
                }`}>
                  {isAccepted ? (
                    <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
                  ) : (
                    <ShieldX className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className={`text-sm font-bold ${isAccepted ? "text-success" : "text-destructive"}`}>
                      {isAccepted ? "合格" : "不合格"} {passedCount}/{totalRules} 项达标
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {isAccepted
                        ? "所有验收指标均已达标"
                        : `仅 ${passedCount}/${totalRules} 项达标（要求≥${totalRules}），传感器未通过验收`
                      }
                    </div>
                  </div>
                </div>

                {/* 各项指标 */}
                <div className="space-y-2">
                  <MetricRow
                    label="均匀性 RSD"
                    value={`${rsd.toFixed(2)}%`}
                    passed={ruleResults[0].passed}
                  />
                  <MetricRow
                    label="重复性 eR"
                    value={`${repeatability.toFixed(2)}%FSO`}
                    passed={ruleResults[1].passed}
                  />
                  <MetricRow
                    label="一致性评分"
                    value={`${consistency.toFixed(2)}分`}
                    passed={ruleResults[2].passed}
                  />
                  <MetricRow
                    label="活跃点比率"
                    value={`${activeRatio.toFixed(2)}%`}
                    passed={ruleResults[3].passed}
                  />
                </div>

                {/* 活跃点占比切换 */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[11px] text-muted-foreground">活跃点占比</span>
                  </div>
                  <Switch
                    checked={showActiveOnly}
                    onCheckedChange={setShowActiveOnly}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">宫格模式 · 3项达标规则</span>
                  <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                    <Settings className="w-3 h-3" />
                    设置规则
                  </button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 核心指标评分 */}
          <Collapsible open={metricsOpen} onOpenChange={setMetricsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-accent/30 transition-colors border-b border-border">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold">核心指标评分</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono tracking-widest">ISO 9725</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${metricsOpen ? "" : "-rotate-90"}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-4 border-b border-border">
                {/* 三个环形评分 */}
                <div className="flex justify-around items-center">
                  <ScoreRing
                    score={Math.round(Math.max(0, 100 - rsd))}
                    label="均匀性"
                    sublabel="Spatial"
                    color={rsd < 30 ? "#10b981" : rsd < 60 ? "#f59e0b" : "#ef4444"}
                  />
                  <ScoreRing
                    score={Math.round(repeatability)}
                    label="重复性"
                    sublabel="Temporal"
                    color={repeatability > 60 ? "#10b981" : repeatability > 30 ? "#f59e0b" : "#ef4444"}
                  />
                  <ScoreRing
                    score={consistency}
                    label="一致性"
                    sublabel="Overall"
                    color={consistency > 60 ? "#10b981" : consistency > 30 ? "#f59e0b" : "#ef4444"}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 均匀性 UNIFORMITY */}
          <Collapsible open={uniformityOpen} onOpenChange={setUniformityOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-accent/30 transition-colors border-b border-border">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold">均匀性 UNIFORMITY</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-primary cursor-pointer hover:underline">完整模型</span>
                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${uniformityOpen ? "" : "-rotate-90"}`} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-3 border-b border-border space-y-2.5">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  不同空间位置传感单元在相同压力下输出响应的差异程度
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <StatBlock label="标准偏差 S" value={calcStdDev(currentData.matrix).toFixed(1)} />
                  <StatBlock label="平均值 X" value={stats.avg.toString()} />
                  <StatBlock label="最大值" value={stats.max.toString()} />
                  <StatBlock label="最小值" value={stats.min > 0 ? stats.min.toString() : "0"} />
                  <StatBlock label="活跃点数" value={`${stats.activeCount}/${stats.totalCount}`} />
                  <StatBlock label="RSD %" value={`${rsd.toFixed(1)}%`} />
                </div>

                {/* 压力分布直方图 */}
                <div className="mt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">压力分布</span>
                  </div>
                  <HistogramChart matrix={currentData.matrix} threshold={adcThreshold} />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 模拟状态提示 */}
          {isDemo && (
            <div className="px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-success bg-success/5 rounded-md px-3 py-2 border border-success/20">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>已启动模拟数据模式</span>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

/** 指标行 */
function MetricRow({ label, value, passed }: { label: string; value: string; passed: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
          passed ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
        }`}>
          {passed ? "✓" : "✗"}
        </span>
        <span className="text-[12px] text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-mono font-medium text-foreground">{value}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          passed ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        }`}>
          {passed ? "达标" : "偏差"}
        </span>
      </div>
    </div>
  );
}

/** 环形评分 */
function ScoreRing({ score, label, sublabel, color }: { score: number; label: string; sublabel: string; color: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[76px] h-[76px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/50" />
          <circle
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[11px] font-medium text-foreground">{label}</div>
        <div className="text-[9px] text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}

/** 统计块 */
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card rounded-md border border-border px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold text-foreground">{value}</div>
    </div>
  );
}

/** 直方图 */
function HistogramChart({ matrix, threshold }: { matrix: number[][]; threshold: number }) {
  const histogram = useMemo(() => {
    const bins = new Array(10).fill(0);
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < (matrix[r]?.length ?? 0); c++) {
        const val = matrix[r][c];
        if (val > threshold) {
          const bin = Math.min(9, Math.floor(val / 26));
          bins[bin]++;
        }
      }
    }
    return bins;
  }, [matrix, threshold]);

  const maxBin = Math.max(...histogram, 1);

  return (
    <div className="flex items-end gap-0.5 h-14">
      {histogram.map((count, i) => {
        const height = (count / maxBin) * 100;
        const rangeStart = i * 26;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full rounded-t-sm transition-all duration-300 bg-primary/60 hover:bg-primary/80"
              style={{ height: `${Math.max(2, height)}%` }}
            />
            <span className="text-[7px] text-muted-foreground/60 font-mono">
              {rangeStart}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 计算标准差 */
function calcStdDev(matrix: number[][]): number {
  const vals: number[] = [];
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < (matrix[r]?.length ?? 0); c++) {
      if (matrix[r][c] > 0) vals.push(matrix[r][c]);
    }
  }
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}
