/**
 * 验收测试面板 - 合并自动化验收控制 + 圆环评分
 * 设计风格: 深空控制台 - 工业监控仪表（与左侧面板统一）
 *
 * 布局结构（从上到下）:
 * 1. 圆环区域（居中，根据状态切换：待机/测试中动画/评分结果）
 * 2. 验收模式选择（分段控制器）
 * 3. 测试状态信息（进度、消息、按压记录）
 * 4. 操作按钮（开始/停止/设置）
 */
import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  Play,
  Square,
  Settings2,
  Target,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Hash,
  BarChart3,
  MapPin,
  Download,
  Loader2,
  RotateCcw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
// import { Slider } from "@/components/ui/slider"; // 已隐藏滑动条
import type {
  AutoTestConfig,
  AutoTestProgress,
  PointComparisonResult,
  PressEvent,
  AcceptanceTestType,
} from "@/lib/auto-test";
import {
  DEFAULT_AUTO_TEST_CONFIG,
  loadAutoTestConfig,
  saveAutoTestConfig,
  generateSampleId,
} from "@/lib/auto-test";
import { toast } from "sonner";

interface AcceptanceTestPanelProps {
  isConnected: boolean;
  progress: AutoTestProgress;
  onStartTest: (config: AutoTestConfig, testType: AcceptanceTestType) => void;
  onStopTest: () => void;
  onReset?: () => void;
  onSkipPoint?: () => void;
  onFinishNow?: () => void;
  onGenerateReport?: () => void;
}

// ============================================================
// 圆环 - 评分结果
// ============================================================

function ScoreRing({
  score,
  grade,
  sublabel,
  size = 130,
}: {
  score: number;
  grade: string;
  sublabel?: string;
  size?: number;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (Math.min(100, score) / 100) * circumference;

  const [animatedOffset, setAnimatedOffset] = useState(circumference);
  const [displayScore, setDisplayScore] = useState(0);
  const [entered, setEntered] = useState(false);
  const prevScoreRef = useRef(score);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedOffset(targetOffset);
      setEntered(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [targetOffset]);

  useEffect(() => {
    const startVal = prevScoreRef.current !== score ? prevScoreRef.current : 0;
    prevScoreRef.current = score;
    const duration = 1200;
    const startTime = performance.now();
    let rafId: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(startVal + (score - startVal) * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [score]);

  const getColor = (s: number) => {
    if (s >= 90) return "#4ade80";
    if (s >= 70) return "#1e6fd9";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const color = getColor(score);

  return (
    <div className={`flex flex-col items-center transition-all duration-700 ${entered ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* 外圈刻度 */}
        <svg width={size} height={size} className="absolute inset-0">
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const isMajor = i % 10 === 0;
            const outerR = size / 2 - 1;
            const innerR = outerR - (isMajor ? 5 : 3);
            return (
              <line
                key={i}
                x1={size / 2 + outerR * Math.cos(rad)}
                y1={size / 2 + outerR * Math.sin(rad)}
                x2={size / 2 + innerR * Math.cos(rad)}
                y2={size / 2 + innerR * Math.sin(rad)}
                stroke={isMajor ? "rgba(30,111,217,0.3)" : "rgba(30,111,217,0.12)"}
                strokeWidth={isMajor ? 1.5 : 0.5}
              />
            );
          })}
        </svg>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(30, 111, 217, 0.06)"
            strokeWidth={5}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animatedOffset}
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease",
              filter: `drop-shadow(0 0 6px ${color}44)`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-2xl font-mono font-bold led-text tracking-tight"
            style={{ color }}
          >
            {displayScore}
          </span>
          <span
            className={`text-[9px] font-semibold mt-0.5 tracking-wide transition-opacity duration-500 ${entered ? "opacity-100" : "opacity-0"}`}
            style={{ color: `${color}cc`, transitionDelay: "0.6s" }}
          >
            {grade}
          </span>
        </div>
      </div>
      {sublabel && (
        <span className={`text-[9px] text-muted-foreground/50 mt-1 transition-opacity duration-500 ${entered ? "opacity-100" : "opacity-0"}`} style={{ transitionDelay: "0.8s" }}>
          {sublabel}
        </span>
      )}
    </div>
  );
}

// ============================================================
// 圆环 - 测试中动画
// ============================================================

function TestingRing({ label, size = 130 }: { label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const isMajor = i % 10 === 0;
            const outerR = size / 2 - 1;
            const innerR = outerR - (isMajor ? 5 : 3);
            return (
              <line
                key={i}
                x1={size / 2 + outerR * Math.cos(rad)}
                y1={size / 2 + outerR * Math.sin(rad)}
                x2={size / 2 + innerR * Math.cos(rad)}
                y2={size / 2 + innerR * Math.sin(rad)}
                stroke={isMajor ? "rgba(30,111,217,0.2)" : "rgba(30,111,217,0.08)"}
                strokeWidth={isMajor ? 1.5 : 0.5}
              />
            );
          })}
        </svg>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(30, 111, 217, 0.06)"
            strokeWidth={5}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(30, 111, 217, 0.5)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${circumference * 0.3} ${circumference * 0.7}`}
            style={{
              transformOrigin: "center",
              animation: "spin 2.5s linear infinite",
              filter: "drop-shadow(0 0 6px rgba(30, 111, 217, 0.3))",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Loader2 className="w-5 h-5 text-jq-blue/70 animate-spin mb-0.5" />
          <span className="text-[10px] text-muted-foreground/70 font-medium">
            测试中
          </span>
        </div>
      </div>
      <span className="text-[9px] text-muted-foreground/50 mt-1">{label}</span>
    </div>
  );
}

// ============================================================
// 圆环 - 待机
// ============================================================

function IdleRing({ size = 130 }: { size?: number }) {
  const radius = (size - 12) / 2;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const isMajor = i % 10 === 0;
            const outerR = size / 2 - 1;
            const innerR = outerR - (isMajor ? 5 : 3);
            return (
              <line
                key={i}
                x1={size / 2 + outerR * Math.cos(rad)}
                y1={size / 2 + outerR * Math.sin(rad)}
                x2={size / 2 + innerR * Math.cos(rad)}
                y2={size / 2 + innerR * Math.sin(rad)}
                stroke={isMajor ? "rgba(30,111,217,0.12)" : "rgba(30,111,217,0.05)"}
                strokeWidth={isMajor ? 1 : 0.5}
              />
            );
          })}
        </svg>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            strokeWidth={5}
            strokeDasharray="3 4"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Target className="w-5 h-5 text-muted-foreground/15 mb-0.5" />
          <span className="text-[10px] text-muted-foreground/30 font-medium">
            待机
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 按压记录项
// ============================================================

function PressEventItem({ event, testType }: { event: PressEvent; testType?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-industrial-dark/50 border border-industrial-border/30 text-[10px]">
      <span className="font-mono text-jq-blue font-bold w-5">#{event.index}</span>
      <span className="flex items-center gap-0.5 font-mono text-foreground/80">
        <MapPin className="w-2.5 h-2.5 text-muted-foreground/50" />
        ({event.position[0]},{event.position[1]})
      </span>
      <span className="font-mono text-cyan-400/80">{event.meanValue.toFixed(1)}</span>
    </div>
  );
}

// ============================================================
// 测试结果区域
// ============================================================

function ComparisonResult({ result }: { result: PointComparisonResult }) {
  const testTypeLabel =
    result.testType === "consistency" ? "一致性" : "重复性";
  return (
    <div className="space-y-2">
      {/* 完成摘要 */}
      <div className="text-center py-2 rounded bg-success-green/5 border border-success-green/15">
        <CheckCircle2 className="w-4 h-4 mx-auto mb-0.5 text-success-green/80" />
        <div className="text-[11px] font-semibold text-success-green/90">测试完成</div>
        <div className="text-[9px] text-muted-foreground/50 mt-0.5">
          {testTypeLabel}验收 ·{" "}
          {result.testType === "repeatability"
            ? `${result.pressCount} 次按压`
            : `${result.pressCount} 个点位`}
        </div>
      </div>
      {/* 各点数据 */}
      <div className="space-y-1">
        <div className="text-[9px] text-muted-foreground/50 font-medium flex items-center gap-1 font-mono uppercase tracking-wider">
          <BarChart3 className="w-3 h-3" />
          {result.testType === "repeatability"
            ? "各次按压数据"
            : "各点位数据"}
        </div>
        <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
          {result.pressEvents.map((evt) => (
            <PressEventItem key={evt.index} event={evt} testType={result.testType} />
          ))}
        </div>
      </div>
      {/* 导出CSV */}
      <button
        className="w-full flex items-center justify-center gap-1.5 h-7 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 bg-industrial-dark/50 border border-industrial-border/40 rounded hover:bg-jq-blue/10 hover:text-jq-blue hover:border-jq-blue/30 transition-all duration-200"
        onClick={() => {
          const validEvents = result.pressEvents.filter(
            (evt) => evt.meanValue > 0 && evt.frameCount > 0
          );
          const isConsistency = result.testType === "consistency";
          const headers = [
            "序号",
            "点位行",
            "点位列",
            "ADC均值",
            isConsistency ? "与总均值偏差" : "ADC标准差",
            "ADC最大值",
            "ADC最小值",
            "采集帧数",
            "持续时间(s)",
            "原始序列",
          ];
          const rows = validEvents.map((evt, idx) => [
            idx + 1,
            evt.position[0],
            evt.position[1],
            evt.meanValue.toFixed(2),
            isConsistency ? (evt.meanValue - result.interPointMean).toFixed(2) : evt.stdValue.toFixed(2),
            evt.maxValue,
            evt.minValue,
            evt.frameCount,
            evt.duration.toFixed(3),
            evt.valueSeries.join(";"),
          ]);
          const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
            "\n"
          );
          const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const typeLabel =
            result.testType === "repeatability" ? "重复性" : "一致性";
          a.download = `${typeLabel}_原始数据_${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[T:]/g, "-")}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("原始数据已导出为CSV");
        }}
      >
        <Download className="w-3 h-3" />
        导出原始数据
      </button>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

function AcceptanceTestPanelInner({
  isConnected,
  progress,
  onStartTest,
  onStopTest,
  onReset,
  onSkipPoint,
  onFinishNow,
  onGenerateReport,
}: AcceptanceTestPanelProps) {
  const [config, setConfig] = useState<AutoTestConfig>(loadAutoTestConfig);

  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [testType, setTestType] =
    useState<AcceptanceTestType>("consistency");
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const isRunning =
    progress.phase !== "idle" &&
    progress.phase !== "completed" &&
    progress.phase !== "error";
  const isIdle =
    progress.phase === "idle" ||
    progress.phase === "completed" ||
    progress.phase === "error";

  useEffect(() => {
    saveAutoTestConfig(config);
  }, [config]);

  // 点击"开始验收"时，先弹出设置确认对话框
  const handleStartClick = useCallback(() => {
    if (!isConnected) {
      toast.error("请先连接设备");
      return;
    }
    // 自动填充样品编号（如果为空）
    if (!config.sampleId) {
      setConfig((prev) => ({ ...prev, sampleId: generateSampleId() }));
    }
    setStartConfirmOpen(true);
  }, [isConnected, config.sampleId]);

  // 用户在设置对话框中确认后，正式开始测试
  const handleConfirmStart = useCallback(() => {
    const testConfig = {
      ...config,
      sampleId: config.sampleId || generateSampleId(),
    };
    setConfig(testConfig);
    setStartConfirmOpen(false);
    onStartTest(testConfig, testType);
  }, [config, onStartTest, testType]);

  const phaseLabel: Record<string, string> = {
    idle: "就绪",
    monitoring: "等待按压",
    pressing: "采集中",
    waiting: "等待下一次按压",
    analyzing: "分析中",
    completed: "测试完成",
    error: "测试出错",
  };

  // 未连接
  if (!isConnected) {
    return (
      <div className="h-full flex flex-col">
        <div className="industrial-panel-header flex items-center gap-2 px-3 py-2 border-b border-industrial-border/50">
          <Target className="w-3.5 h-3.5 text-jq-blue" />
          <span className="text-xs font-semibold tracking-wide">验收测试</span>
          <span className="text-[8px] text-muted-foreground/30 ml-auto font-mono tracking-widest">
            ISO 5725
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-6">
          <BarChart3 className="w-8 h-8 opacity-10" />
          <p className="text-[11px] text-center leading-relaxed text-muted-foreground/40">
            连接设备后
            <br />
            开始验收测试
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-full flex flex-col">
      {/* 顶部标题栏 - 使用统一的industrial-panel-header */}
      <div className="industrial-panel-header flex items-center gap-2 px-3 py-2 border-b border-industrial-border/50 shrink-0">
        <Target className="w-3.5 h-3.5 text-jq-blue" />
        <span className="text-xs font-semibold tracking-wide">验收测试</span>
        {isRunning && (
          <span className="text-[9px] font-mono text-cyan-glow animate-pulse flex items-center gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-glow" />
            {phaseLabel[progress.phase]}
          </span>
        )}
        <span className="text-[8px] text-muted-foreground/30 ml-auto font-mono tracking-widest">
          ISO 5725
        </span>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-3 space-y-3">
          {/* ===== 测试完成后的操作按钮 ===== */}
          {(progress.phase === "completed" || progress.phase === "error") && (
            <div className="flex gap-2">
              {onGenerateReport && progress.phase === "completed" && (
                <button
                  onClick={onGenerateReport}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded text-[10px] font-mono uppercase tracking-wider text-white bg-jq-blue/90 hover:bg-jq-blue border border-jq-blue/50 shadow-[0_0_8px_rgba(30,111,217,0.15)] hover:shadow-[0_0_12px_rgba(30,111,217,0.25)] transition-all duration-200 active:scale-[0.98]"
                >
                  <FileText className="w-3 h-3" />
                  生成报告
                </button>
              )}
              {onReset && (
                <button
                  onClick={() => {
                    setConfirmResetOpen(true);
                    setPendingAction(() => onReset);
                  }}
                  className="flex items-center justify-center gap-1.5 h-8 px-4 rounded text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 bg-industrial-dark/60 border border-industrial-border/40 hover:bg-warning-orange/10 hover:text-warning-orange hover:border-warning-orange/30 transition-all duration-200 active:scale-[0.98]"
                >
                  <RotateCcw className="w-3 h-3" />
                  重新测试
                </button>
              )}
            </div>
          )}

          {/* ===== 圆环区域 ===== */}
          <div className="flex justify-center py-3">
            {progress.phase === "completed" && progress.result ? (
              <ScoreRing
                score={
                  progress.result.testType === "repeatability"
                    ? progress.result.repeatabilityScore
                    : progress.result.consistencyScore
                }
                grade={
                  progress.result.testType === "repeatability"
                    ? progress.result.repeatabilityGrade
                    : progress.result.consistencyGrade
                }
                sublabel={
                  progress.result.testType === "repeatability" && progress.targetPoint
                    ? `单点(${progress.targetPoint[0]},${progress.targetPoint[1]}) · 重复性`
                    : progress.result.testType === "consistency"
                    ? `${progress.result.pressCount}点位 · 一致性`
                    : undefined
                }
                size={130}
              />
            ) : isRunning && progress.liveScore !== null && progress.liveScore !== undefined ? (
              <ScoreRing
                score={progress.liveScore}
                grade={progress.liveGrade ?? ""}
                sublabel={
                  testType === "repeatability"
                    ? `已按压 ${progress.pressCount} 次 · 重复性`
                    : `已采集 ${progress.pressCount} 点位 · 一致性`
                }
                size={130}
              />
            ) : isRunning ? (
              <TestingRing
                label={
                  testType === "repeatability"
                    ? `重复性 · 已${progress.currentPointPressCount}次`
                    : `一致性 · ${progress.pressCount} 点`
                }
                size={130}
              />
            ) : (
              <IdleRing size={130} />
            )}
          </div>

          {/* ===== 验收模式选择 ===== */}
          {isIdle && (
            <div className="space-y-2">
              <div className="text-[9px] text-muted-foreground/40 font-mono uppercase tracking-widest">
                验收模式
              </div>
              <div className="relative p-0.5 rounded bg-industrial-dark/80 border border-industrial-border/40">
                {/* 滑块指示器 */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded bg-jq-blue/15 border border-jq-blue/25 transition-all duration-300 ease-out"
                  style={{
                    left:
                      testType === "consistency"
                        ? "2px"
                        : "calc(50% + 2px)",
                  }}
                />
                <div className="relative grid grid-cols-2 gap-0">
                  <button
                    onClick={() => {
                      if (testType !== "consistency") {
                        if (progress.phase === "completed" || progress.phase === "error") {
                          setConfirmResetOpen(true);
                          setPendingAction(() => () => {
                            setTestType("consistency");
                            if (onReset) onReset();
                          });
                        } else {
                          setTestType("consistency");
                        }
                      }
                    }}
                    className={`relative z-10 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-center transition-all duration-300 ${
                      testType === "consistency"
                        ? "text-jq-blue-bright"
                        : "text-muted-foreground/40 hover:text-muted-foreground/60"
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">一致性</span>
                  </button>
                  <button
                    onClick={() => {
                      if (testType !== "repeatability") {
                        if (progress.phase === "completed" || progress.phase === "error") {
                          setConfirmResetOpen(true);
                          setPendingAction(() => () => {
                            setTestType("repeatability");
                            if (onReset) onReset();
                          });
                        } else {
                          setTestType("repeatability");
                        }
                      }
                    }}
                    className={`relative z-10 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-center transition-all duration-300 ${
                      testType === "repeatability"
                        ? "text-jq-blue-bright"
                        : "text-muted-foreground/40 hover:text-muted-foreground/60"
                    }`}
                  >
                    <Target className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">重复性</span>
                  </button>
                </div>
              </div>
              <div className="text-[9px] text-muted-foreground/35 leading-relaxed pl-0.5">
                {testType === "consistency"
                  ? "验证不同点位在相同压力下输出值的一致程度"
                  : "验证同一点位多次按压输出值的稳定程度"}
              </div>
            </div>
          )}

          {/* ===== 流程说明（仅idle） ===== */}
          {progress.phase === "idle" && (
            <div className="text-[10px] text-muted-foreground/50 leading-relaxed space-y-1 bg-industrial-dark/40 rounded p-2.5 border border-industrial-border/25">
              <p className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-wider">
                {testType === "consistency"
                  ? "一致性验收流程"
                  : "重复性验收流程"}
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-[9px] text-muted-foreground/45">
                <li>点击"开始验收"进入监测模式</li>
                {testType === "consistency" ? (
                  <>
                    <li>用砝码按压某个点位，保持至数据稳定</li>
                    <li>移开砝码，换到另一位置按压</li>
                    <li>至少按压2个不同点位</li>
                    <li>点击"完成验收"查看分析结果</li>
                  </>
                ) : (
                  <>
                    <li>在任意点位放置砝码，系统自动锁定</li>
                    <li>拿起砝码记录基线值，然后反复按压</li>
                    <li>至少按压2次后可手动点击"完成验收"</li>
                  </>
                )}
              </ol>
            </div>
          )}

          {/* ===== 测试状态信息 ===== */}
          {progress.phase !== "idle" && progress.phase !== "completed" && progress.phase !== "error" && (
            <div className="space-y-2">
              {/* 状态消息（biasWarning存在时不显示，避免重复） */}
              {progress.message && !progress.biasWarning && (
                <div className="text-[9px] text-muted-foreground/60 bg-industrial-dark/40 rounded px-2.5 py-1.5 border border-industrial-border/20 leading-relaxed">
                  {progress.message}
                </div>
              )}

              {/* 当前按压点信息 */}
              {progress.phase === "pressing" && progress.currentPoint && (
                <div className="flex items-center gap-3 text-[10px] bg-cyan-glow/5 rounded px-2.5 py-1.5 border border-cyan-glow/15">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-glow/70" />
                    <span className="font-mono text-cyan-glow/80">
                      ({progress.currentPoint[0]},{progress.currentPoint[1]})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/40 text-[9px]">ADC</span>
                    <span className="font-mono text-cyan-glow/80">
                      {progress.currentValue.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Timer className="w-2.5 h-2.5 text-muted-foreground/30" />
                    <span className="font-mono text-muted-foreground/40 text-[9px]">
                      {progress.currentDuration.toFixed(1)}s
                    </span>
                  </div>
                </div>
              )}

              {/* 偏置警告 */}
              {progress.biasWarning && (
                <div className="text-[9px] text-danger-red/80 bg-danger-red/8 rounded px-2.5 py-1.5 border border-danger-red/15 animate-pulse flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{progress.biasWarning}</span>
                </div>
              )}

              {/* 重复性锁定点 + 进度 */}
              {progress.targetPoint && progress.totalPoints > 0 && (
                <div className="flex items-center gap-3 text-[10px] bg-jq-blue/5 rounded px-2.5 py-1.5 border border-jq-blue/15">
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-jq-blue/60" />
                    <span className="text-muted-foreground/50 text-[9px]">锁定</span>
                    <span className="font-mono text-jq-blue/80">
                      ({progress.targetPoint[0]},{progress.targetPoint[1]})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-muted-foreground/40 text-[9px]">已按压</span>
                    <span className="font-mono text-foreground/70">
                      {progress.currentPointPressCount} 次
                    </span>
                  </div>
                </div>
              )}

              {/* 已采集次数 */}
              <div className="flex items-center gap-2 text-[10px]">
                <Hash className="w-3 h-3 text-jq-blue/50" />
                <span className="text-muted-foreground/40">已按压:</span>
                <span className="font-mono font-bold text-foreground/70">
                  {progress.pressCount}
                </span>
                {progress.pressCount < 2 &&
                  isRunning && (
                    <span className="text-[9px] text-warning-orange/60 ml-auto">
                      {testType === "repeatability" ? "至少需2次" : "至少需2个点位"}
                    </span>
                  )}
              </div>

              {/* 已完成的按压列表 */}
              {progress.completedPresses.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-muted-foreground/35 font-mono uppercase tracking-wider">
                    按压记录
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {progress.completedPresses.map((evt) => (
                      <PressEventItem key={evt.index} event={evt} testType={testType} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== 测试结果 ===== */}
          {progress.phase === "completed" && progress.result && (
            <ComparisonResult result={progress.result} />
          )}

          {/* ===== 错误信息 ===== */}
          {progress.phase === "error" && progress.error && (
            <div className="text-[10px] text-danger-red/70 bg-danger-red/5 rounded px-2.5 py-1.5 border border-danger-red/15">
              {progress.error}
            </div>
          )}

          {/* ===== 操作按钮 ===== */}
          <div className="space-y-2 pt-1">
            {isIdle ? (
              <div className="flex gap-2">
                <button
                  onClick={handleStartClick}
                  disabled={!isConnected}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded text-[10px] font-mono uppercase tracking-wider text-white bg-jq-blue/90 hover:bg-jq-blue border border-jq-blue/40 shadow-[0_0_8px_rgba(30,111,217,0.15)] hover:shadow-[0_0_12px_rgba(30,111,217,0.25)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  <Play className="w-3 h-3" />
                  开始验收
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onStopTest}
                      disabled={progress.phase === "analyzing"}
                      className={`w-full flex items-center justify-center gap-1.5 h-8 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                        progress.pressCount >= 2
                          ? "text-white bg-success-green/80 hover:bg-success-green/90 border border-success-green/40 shadow-[0_0_8px_rgba(74,222,128,0.1)]"
                          : "text-muted-foreground/70 bg-industrial-dark/60 border border-industrial-border/40 hover:bg-danger-red/10 hover:text-danger-red hover:border-danger-red/30"
                      }`}
                    >
                      <Square className="w-3 h-3" />
                      {progress.pressCount >= 2 ? "完成验收" : "取消验收"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {progress.pressCount >= 2
                      ? "完成测试并生成分析报告"
                      : testType === "repeatability"
                      ? "至少需要按压2次才能生成报告"
                      : "至少需要2个点位才能生成报告"}
                  </TooltipContent>
                </Tooltip>
                {testType === "repeatability" && progress.targetPoint && (
                  <button
                    onClick={onSkipPoint}
                    className="w-full flex items-center justify-center gap-1.5 h-7 rounded text-[10px] font-mono text-muted-foreground/50 bg-industrial-dark/40 border border-industrial-border/30 hover:bg-jq-blue/5 hover:text-jq-blue/70 hover:border-jq-blue/20 transition-all duration-200"
                  >
                    重新选点
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* ===== 开始验收 - 设置确认对话框 ===== */}
      <Dialog open={startConfirmOpen} onOpenChange={setStartConfirmOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-jq-blue text-sm">
              <Settings2 className="w-4 h-4" />
              验收测试设置
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-[10px] text-muted-foreground/60 bg-jq-blue/5 rounded px-3 py-2 border border-jq-blue/15">
              当前模式：<span className="font-semibold text-jq-blue">{testType === "consistency" ? "一致性验收" : "重复性验收"}</span>
              <span className="text-muted-foreground/40 ml-1">· 请确认以下参数后开始测试</span>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                样品编号
              </label>
              <input
                type="text"
                value={config.sampleId}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    sampleId: e.target.value,
                  }))
                }
                placeholder="自动生成"
                className="w-full h-8 bg-industrial-dark/50 border border-industrial-border/40 rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                砝码重量 (g)
              </label>
              <input
                type="text"
                value={config.weightGrams}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weightGrams: e.target.value,
                  }))
                }
                placeholder="如: 500"
                className="w-full h-8 bg-industrial-dark/50 border border-industrial-border/40 rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                环境温度 (°C)
              </label>
              <input
                type="text"
                value={config.temperature}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    temperature: e.target.value,
                  }))
                }
                placeholder="如: 25"
                className="w-full h-8 bg-industrial-dark/50 border border-industrial-border/40 rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                测试人员
              </label>
              <input
                type="text"
                value={config.operator}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    operator: e.target.value,
                  }))
                }
                placeholder="可选"
                className="w-full h-8 bg-industrial-dark/50 border border-industrial-border/40 rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                测试备注
              </label>
              <input
                type="text"
                value={config.notes}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                placeholder="可选"
                className="w-full h-8 bg-industrial-dark/50 border border-industrial-border/40 rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <button
              onClick={() => setStartConfirmOpen(false)}
              className="px-4 h-8 rounded text-[11px] font-mono text-muted-foreground/70 bg-industrial-dark/60 border border-industrial-border/40 hover:bg-industrial-dark hover:text-foreground/80 transition-all duration-200"
            >
              取消
            </button>
            <button
              onClick={handleConfirmStart}
              className="px-6 h-8 rounded text-[11px] font-mono text-white bg-jq-blue/90 hover:bg-jq-blue border border-jq-blue/40 shadow-[0_0_8px_rgba(30,111,217,0.15)] hover:shadow-[0_0_12px_rgba(30,111,217,0.25)] transition-all duration-200 flex items-center gap-1.5"
            >
              <Play className="w-3 h-3" />
              确认并开始测试
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 数据清除确认对话框 ===== */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="sm:max-w-[380px] bg-card border-industrial-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning-orange text-sm">
              <AlertTriangle className="w-4 h-4" />
              数据清除确认
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              当前测试数据将被清除，请确认您已保存所需的测试报告或原始数据。
            </p>
            <p className="text-[10px] text-muted-foreground/50">
              提示：可先点击"生成报告"保存PDF，或"导出原始数据"保存CSV文件。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setConfirmResetOpen(false);
                  setPendingAction(null);
                }}
                className="px-4 h-8 rounded text-[11px] font-mono text-muted-foreground/70 bg-industrial-dark/60 border border-industrial-border/40 hover:bg-industrial-dark hover:text-foreground/80 transition-all duration-200"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setConfirmResetOpen(false);
                  if (pendingAction) {
                    pendingAction();
                    setPendingAction(null);
                  }
                }}
                className="px-4 h-8 rounded text-[11px] font-mono text-white bg-danger-red/80 hover:bg-danger-red border border-danger-red/40 transition-all duration-200"
              >
                确认清除
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const AcceptanceTestPanel = memo(AcceptanceTestPanelInner);
export default AcceptanceTestPanel;
