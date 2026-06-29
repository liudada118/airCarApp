/**
 * 数据分析面板 - 单圆环动态指标
 * 设计风格: 深空控制台 - 工业监控仪表
 * 
 * 根据当前测试状态动态切换显示：
 * - 测试进行中：显示"测试中"动画状态（不显示分数）
 * - 测试完成后：显示最终评分结果
 * - 空闲时：显示待机状态
 */
import { memo } from "react";
import type {
  BasicStats,
  ConsistencyResult,
  RepeatabilityResult,
} from "@/lib/analysis";
import {
  BarChart3,
  Target,
  Loader2,
} from "lucide-react";

type TestMode = "idle" | "repeatability" | "consistency";
type TestPhase = "idle" | "testing" | "completed";

interface AnalysisPanelProps {
  stats: BasicStats;
  consistency: ConsistencyResult;
  repeatability: RepeatabilityResult;
  isConnected: boolean;
  adcThreshold?: number;
  /** 当前测试模式 */
  testMode: TestMode;
  /** 当前测试阶段 */
  testPhase: TestPhase;
  /** 自动化验收单点重复性评分覆盖 (0-100) */
  autoTestRepeatScore?: number | null;
  /** 自动化验收单点重复性等级覆盖 */
  autoTestRepeatGrade?: string | null;
  /** 自动化验收一致性评分覆盖 (0-100) */
  autoTestConsistencyScore?: number | null;
  /** 自动化验收一致性等级覆盖 */
  autoTestConsistencyGrade?: string | null;
  /** 自动化验收锁定点位坐标 */
  autoTestLockedPoint?: [number, number] | null;
}

// ============================================================
// 圆环组件 - 显示评分结果
// ============================================================

function ScoreRing({ score, grade, label, sublabel, size = 120 }: {
  score: number;
  grade: string;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, score) / 100) * circumference;

  const getColor = (s: number) => {
    if (s >= 90) return "#4ade80";
    if (s >= 70) return "#1e6fd9";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(30, 111, 217, 0.08)" strokeWidth={5}
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 6px ${color}55)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-mono font-bold led-text" style={{ color }}>
            {score.toFixed(0)}
          </span>
          <span className="text-[9px] font-medium mt-0.5" style={{ color: `${color}cc` }}>
            {grade}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {sublabel && (
        <span className="text-[9px] text-muted-foreground/60 -mt-1">{sublabel}</span>
      )}
    </div>
  );
}

// ============================================================
// 测试中动画圆环（不显示分数）
// ============================================================

function TestingRing({ label, size = 120 }: {
  label: string;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(30, 111, 217, 0.08)" strokeWidth={5}
          />
          {/* 旋转动画弧 */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(30, 111, 217, 0.6)" strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            className="animate-spin origin-center"
            style={{
              transformOrigin: "center",
              animation: "spin 2s linear infinite",
              filter: "drop-shadow(0 0 4px rgba(30, 111, 217, 0.4))",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 className="w-5 h-5 text-jq-blue animate-spin mb-1" />
          <span className="text-[10px] text-muted-foreground font-medium">测试中</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

function AnalysisPanelInner({
  stats: _stats,
  consistency: _consistency,
  repeatability: _repeatability,
  isConnected,
  adcThreshold: _adcThreshold = 5,
  testMode,
  testPhase,
  autoTestRepeatScore = null,
  autoTestRepeatGrade = null,
  autoTestConsistencyScore = null,
  autoTestConsistencyGrade = null,
  autoTestLockedPoint = null,
}: AnalysisPanelProps) {
  if (!isConnected) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 py-20">
        <BarChart3 className="w-10 h-10 opacity-20" />
        <p className="text-xs text-center leading-relaxed">连接设备后<br />将显示分析数据</p>
      </div>
    );
  }

  // 空闲状态：显示待机
  if (testMode === "idle" || testPhase === "idle") {
    return (
      <div className="space-y-3">
        <div className="industrial-panel rounded-md overflow-hidden">
          <div className="industrial-panel-header flex items-center gap-2">
            <Target className="w-3 h-3" />
            <span>测试指标</span>
            <span className="text-[8px] text-muted-foreground/50 ml-auto">ISO 5725</span>
          </div>
          <div className="p-6 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <div className="w-[120px] h-[120px] rounded-full border-2 border-dashed border-border/40 flex items-center justify-center">
              <span className="text-xs text-muted-foreground/50">待机</span>
            </div>
            <span className="text-[10px] text-muted-foreground/60 mt-2">开始验收测试后显示结果</span>
          </div>
        </div>
      </div>
    );
  }

  // 测试进行中：显示"测试中"动画
  if (testPhase === "testing") {
    const label = testMode === "repeatability" ? "重复性测试" : "一致性测试";
    return (
      <div className="space-y-3">
        <div className="industrial-panel rounded-md overflow-hidden">
          <div className="industrial-panel-header flex items-center gap-2">
            <Target className="w-3 h-3" />
            <span>测试指标</span>
            <span className="text-[8px] text-muted-foreground/50 ml-auto">ISO 5725</span>
          </div>
          <div className="p-4 flex flex-col items-center">
            <TestingRing label={label} size={120} />
            {/* 测试模式提示 */}
            <div className="mt-3 w-full">
              <div className={`text-[9px] text-center rounded px-2 py-1.5 border ${
                testMode === "repeatability"
                  ? "text-cyan-400/80 bg-cyan-500/10 border-cyan-500/20"
                  : "text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20"
              }`}>
                {testMode === "repeatability" ? "重复性测试进行中" : "一致性测试进行中"}
                {autoTestLockedPoint && testMode === "repeatability" && ` · 点位(${autoTestLockedPoint[0]},${autoTestLockedPoint[1]})`}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 测试完成：显示最终评分
  const score = testMode === "repeatability"
    ? (autoTestRepeatScore ?? 0)
    : (autoTestConsistencyScore ?? 0);
  const grade = testMode === "repeatability"
    ? (autoTestRepeatGrade || "待定")
    : (autoTestConsistencyGrade || "待定");
  const label = testMode === "repeatability" ? "重复性" : "一致性";
  const sublabel = testMode === "repeatability" && autoTestLockedPoint
    ? `单点(${autoTestLockedPoint[0]},${autoTestLockedPoint[1]})`
    : testMode === "consistency" ? "多点一致性" : undefined;

  return (
    <div className="space-y-3">
      <div className="industrial-panel rounded-md overflow-hidden">
        <div className="industrial-panel-header flex items-center gap-2">
          <Target className="w-3 h-3" />
          <span>测试结果</span>
          <span className="text-[8px] text-muted-foreground/50 ml-auto">ISO 5725</span>
        </div>
        <div className="p-4 flex flex-col items-center">
          <ScoreRing
            score={score}
            grade={grade}
            label={label}
            sublabel={sublabel}
            size={120}
          />
          {/* 完成提示 */}
          <div className="mt-3 w-full">
            <div className="text-[9px] text-center text-green-400/80 bg-green-500/10 rounded px-2 py-1.5 border border-green-500/20">
              测试完成
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const AnalysisPanel = memo(AnalysisPanelInner);
export default AnalysisPanel;
