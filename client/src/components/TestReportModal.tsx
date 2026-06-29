/**
 * 测试报告弹窗组件
 * 测试完成后自动弹出，展示详细测试报告
 * 支持关闭和下载为PDF
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Download, FileText, Target, BarChart3, Repeat, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PointComparisonResult, AutoTestConfig, AcceptanceTestType } from "@/lib/auto-test";

interface TestReportModalProps {
  open: boolean;
  onClose: () => void;
  result: PointComparisonResult | null;
  testType: AcceptanceTestType;
  config?: AutoTestConfig | null;
  matrixSize?: string;
  startTime?: Date | null;
}

export function TestReportModal({ open, onClose, result, testType, config, matrixSize, startTime }: TestReportModalProps) {
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting" | "hidden">("hidden");
  const [contentReady, setContentReady] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && result) {
      setPhase("entering");
      const t1 = setTimeout(() => setPhase("visible"), 50);
      const t2 = setTimeout(() => setContentReady(true), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (!open && phase !== "hidden") {
      setPhase("exiting");
      setContentReady(false);
      const t = setTimeout(() => setPhase("hidden"), 300);
      return () => clearTimeout(t);
    }
  }, [open, result]);

  const handleClose = useCallback(() => {
    setPhase("exiting");
    setContentReady(false);
    setTimeout(() => {
      setPhase("hidden");
      onClose();
    }, 300);
  }, [onClose]);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = useCallback(async () => {
    if (!result) return;
    setIsGeneratingPDF(true);

    try {
      const { generatePDFReport } = await import("@/lib/pdf-report");
      await generatePDFReport({ result, testType, config: config ?? null, matrixSize, startTime });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("PDF\u751f\u6210\u5931\u8d25: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [result, testType, startTime, config, matrixSize]);

  if (phase === "hidden") return null;

  const isRepeatability = testType === "repeatability";
  const score = result ? (isRepeatability ? result.repeatabilityScore : result.consistencyScore) : 0;
  const grade = result ? (isRepeatability ? result.repeatabilityGrade : result.consistencyGrade) : "";
  const testStartTime = startTime || new Date();

  const getScoreColor = (s: number) => {
    if (s >= 90) return "#22c55e";
    if (s >= 70) return "#1e6fd9";
    if (s >= 50) return "#f59e0b";
    return "#ef4444";
  };

  const scoreColor = getScoreColor(score);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        phase === "entering" || phase === "visible" ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal - White background */}
      <div
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-[0_25px_60px_rgba(0,0,0,0.3)] transition-all duration-500 ${
          phase === "visible"
            ? "scale-100 translate-y-0 opacity-100"
            : phase === "entering"
            ? "scale-95 translate-y-8 opacity-0"
            : "scale-95 -translate-y-4 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">验收测试报告</h2>
              <p className="text-[10px] text-gray-400 font-mono">
                {isRepeatability ? "REPEATABILITY" : "CONSISTENCY"} TEST REPORT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPDF ? (
                <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" /></svg>生成中...</>
              ) : (
                <><Download className="w-3 h-3" />下载PDF</>
              )}
            </button>
            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Report Content - White */}
        <div className="overflow-y-auto max-h-[calc(85vh-64px)]">
          <div ref={reportRef} className="p-6 space-y-5">
            {/* Title Section */}
            <div className={`text-center space-y-1.5 transition-all duration-500 delay-100 ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <h1 className="text-lg font-bold text-gray-800 tracking-wide">
                矩侨工业 · 压力传感器{isRepeatability ? "重复性" : "一致性"}验收报告
              </h1>
              <p className="text-[10px] text-gray-400 font-mono">
                ISO 5725 | {testStartTime.toLocaleDateString("zh-CN")} {testStartTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>

            {/* Score Card */}
            <div className={`transition-all duration-700 delay-200 ${contentReady ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}>
              <div className="relative px-8 py-5 rounded-xl border border-gray-100 overflow-hidden bg-gradient-to-r from-blue-50/50 to-green-50/30">
                <div className="flex items-center justify-between">
                  {/* Left: Score */}
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-mono font-black tracking-tight" style={{ color: scoreColor }}>{score.toFixed(0)}</span>
                    <span className="text-sm font-semibold text-gray-400">分</span>
                  </div>
                  {/* Center: Grade */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: scoreColor }} />
                    <span className="text-xl font-black tracking-wide" style={{ color: scoreColor }}>{grade}</span>
                  </div>
                  {/* Right: Verdict */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: score >= 70 ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)' }}>
                    {score >= 70 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className={`text-base font-bold ${score >= 60 ? "text-green-500" : "text-red-500"}`}>
                      {result?.verdict || (score >= 60 ? "合格" : "异常")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Info Grid + Matrix Schematic */}
            <div className={`flex gap-4 transition-all duration-500 delay-300 ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <div className="flex-1 grid grid-cols-3 gap-3">
                <InfoCard icon={<Target className="w-3 h-3" />} label="测试类型" value={isRepeatability ? "单点重复性测试" : "多点一致性测试"} />
                <InfoCard icon={<BarChart3 className="w-3 h-3" />} label="矩阵规格" value={matrixSize || "5x5"} />
                <InfoCard icon={<Repeat className="w-3 h-3" />} label="按压次数" value={`${result?.pressCount || 0} 次`} />
              </div>
              <div className="flex-shrink-0">
                <MatrixSchematic matrixSize={matrixSize || "5x5"} pressEvents={result?.pressEvents || []} isRepeatability={isRepeatability} />
              </div>
            </div>

            {/* Test Conditions */}
            {config && (config.sampleId || config.weightGrams || config.temperature || config.operator) && (
              <div className={`transition-all duration-500 delay-[350ms] ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <SectionTitle>测试条件</SectionTitle>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {config.sampleId && <ConditionItem label="样品编号" value={config.sampleId} />}
                  {config.weightGrams && <ConditionItem label="砝码重量" value={`${config.weightGrams} g`} />}
                  {config.temperature && <ConditionItem label="环境温度" value={`${config.temperature} °C`} />}
                  {config.operator && <ConditionItem label="测试人员" value={config.operator} />}
                </div>
              </div>
            )}

            {/* Detailed Metrics */}
            {result && (
              <div className={`transition-all duration-500 delay-[400ms] ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <SectionTitle>详细指标</SectionTitle>
                <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-[11px] table-fixed">
                    <colgroup>
                      <col style={{width:'40%'}} />
                      <col style={{width:'35%'}} />
                      <col style={{width:'25%'}} />
                    </colgroup>
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">指标</th>
                        <th className="text-center px-4 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">数值</th>
                        <th className="text-right px-4 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">评定</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {isRepeatability ? (
                        <>
                          <MetricRow label="重复性评分" value={`${result.repeatabilityScore.toFixed(1)} 分`} status={result.repeatabilityGrade} color={getScoreColor(result.repeatabilityScore)} />
                          <MetricRow label="变异系数 CV" value={`${result.repeatabilityCV.toFixed(3)} %`} status={result.repeatabilityCV < 5 ? "优秀" : result.repeatabilityCV < 10 ? "良好" : "异常"} color={result.repeatabilityCV < 5 ? "#22c55e" : result.repeatabilityCV < 10 ? "#3b82f6" : "#ef4444"} />
                          <MetricRow label="最大偏差 eR" value={`${result.repeatabilityER.toFixed(3)} %FSO`} status={result.repeatabilityER < 5 ? "优秀" : result.repeatabilityER < 10 ? "良好" : "异常"} color={result.repeatabilityER < 5 ? "#22c55e" : result.repeatabilityER < 10 ? "#3b82f6" : "#ef4444"} />
                          <MetricRow label="ADC均值" value={result.repeatMean.toFixed(2)} status="-" color="#94a3b8" />
                          <MetricRow label="ADC标准差" value={result.repeatStd.toFixed(3)} status="-" color="#94a3b8" />
                        </>
                      ) : (
                        <>
                          <MetricRow label="一致性评分" value={`${result.consistencyScore.toFixed(1)} 分`} status={result.consistencyGrade} color={getScoreColor(result.consistencyScore)} />
                          <MetricRow label="一致性 RSD" value={`${result.consistencyRSD.toFixed(3)} %`} status={result.consistencyRSD < 5 ? "优秀" : result.consistencyRSD < 10 ? "良好" : "异常"} color={result.consistencyRSD < 5 ? "#22c55e" : result.consistencyRSD < 10 ? "#3b82f6" : "#ef4444"} />
                          <MetricRow label="点间均值" value={result.interPointMean.toFixed(2)} status="-" color="#94a3b8" />
                          <MetricRow label="点间标准差" value={result.interPointStd.toFixed(3)} status="-" color="#94a3b8" />
                          <MetricRow label="采样点数" value={`${result.pressCount} 个`} status="-" color="#94a3b8" />
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Press Data Table */}
            {result && result.pressEvents.length > 0 && (
              <div className={`transition-all duration-500 delay-[450ms] ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <SectionTitle>按压数据记录</SectionTitle>
                <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden max-h-52 overflow-y-auto bg-white shadow-sm">
                  <table className="w-full text-[11px] table-fixed">
                    <colgroup>
                      <col style={{width:'25%'}} />
                      <col style={{width:'25%'}} />
                      <col style={{width:'25%'}} />
                      <col style={{width:'25%'}} />
                    </colgroup>
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">#</th>
                        <th className="text-left px-3 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">坐标</th>
                        <th className="text-right px-3 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">ADC均值</th>
                        <th className="text-right px-3 py-2.5 text-gray-500 font-semibold text-[10px] uppercase tracking-wider">{isRepeatability ? "时域标准差" : "点间偏差"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.pressEvents.map((ev, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors duration-150">
                          <td className="text-left px-3 py-2 text-gray-400 font-mono">{ev.index}</td>
                          <td className="text-left px-3 py-2 text-blue-600 font-semibold font-mono">({ev.position[0]},{ev.position[1]})</td>
                          <td className="text-right px-3 py-2 text-gray-800 font-mono tabular-nums">{ev.meanValue.toFixed(1)}</td>
                          <td className="text-right px-3 py-2 text-gray-500 font-mono tabular-nums">{isRepeatability ? ev.stdValue.toFixed(2) : (ev.meanValue - (result?.interPointMean ?? 0)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ADC Summary Chart */}
            {result && result.pressEvents.length > 0 && (
              <div className={`transition-all duration-500 delay-500 ${contentReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
                <SectionTitle>{isRepeatability ? "各次按压ADC均值对比" : "各点位ADC均值对比"}</SectionTitle>
                <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/50 p-5 shadow-sm">
                  <ADCChart pressEvents={result.pressEvents} overallMean={isRepeatability ? result.repeatMean : result.interPointMean} isRepeatability={isRepeatability} scoreColor={scoreColor} interPointStd={result.interPointStd} />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className={`pt-4 mt-2 border-t border-gray-100 text-center transition-all duration-500 delay-[550ms] ${contentReady ? "opacity-100" : "opacity-0"}`}>
              <p className="text-[9px] text-gray-400 font-mono tracking-wide">
                矩侨工业 · 压力传感器矩阵分析系统 v2.0 | 测试开始于 {testStartTime.toISOString().slice(0, 19).replace("T", " ")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// === ADC Summary Chart (SVG-based bar chart) ===
function ADCChart({ pressEvents, overallMean, isRepeatability, scoreColor, interPointStd }: {
  pressEvents: { index: number; position: [number, number]; meanValue: number; stdValue: number }[];
  overallMean: number;
  isRepeatability: boolean;
  scoreColor: string;
  interPointStd?: number;
}) {
  const chartWidth = 520;
  const chartHeight = 160;
  const padding = { top: 20, right: 30, bottom: 36, left: 45 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  // 一致性测试用点间标准差作为误差线，重复性测试用各点时域标准差
  const errStdArr = isRepeatability ? pressEvents.map(e => e.stdValue) : pressEvents.map(() => interPointStd ?? 0);
  const maxVal = Math.max(...pressEvents.map((e, i) => e.meanValue + errStdArr[i]), overallMean * 1.1);
  const minVal = Math.min(...pressEvents.map((e, i) => e.meanValue - errStdArr[i]), 0);
  const range = maxVal - minVal || 1;

  const barWidth = Math.min(28, (innerW / pressEvents.length) * 0.7);
  const gap = (innerW - barWidth * pressEvents.length) / (pressEvents.length + 1);

  const yScale = (v: number) => padding.top + innerH - ((v - minVal) / range) * innerH;
  const meanY = yScale(overallMean);

  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minVal + (range * i) / tickCount);

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="overflow-visible">
      {/* Grid lines */}
      {ticks.map((tick, i) => (
        <g key={i}>
          <line x1={padding.left} y1={yScale(tick)} x2={chartWidth - padding.right} y2={yScale(tick)} stroke="#e5e7eb" strokeDasharray="2,3" />
          <text x={padding.left - 6} y={yScale(tick) + 3} textAnchor="end" className="text-[8px] fill-[#9ca3af]">{tick.toFixed(0)}</text>
        </g>
      ))}

      {/* Mean line */}
      <line x1={padding.left} y1={meanY} x2={chartWidth - padding.right} y2={meanY} stroke={scoreColor} strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7} />
      <text x={chartWidth - padding.right + 4} y={meanY + 3} className="text-[8px] font-mono" fill={scoreColor}>
        μ={overallMean.toFixed(1)}
      </text>

      {/* Bars */}
      {pressEvents.map((ev, i) => {
        const x = padding.left + gap + i * (barWidth + gap);
        const barH = ((ev.meanValue - minVal) / range) * innerH;
        const y = padding.top + innerH - barH;
        const errTop = yScale(ev.meanValue + errStdArr[i]);
        const errBot = yScale(ev.meanValue - errStdArr[i]);
        const barCenter = x + barWidth / 2;

        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} rx={2} fill={scoreColor} opacity={0.65} />
            <rect x={x} y={y} width={barWidth} height={Math.min(3, barH)} rx={2} fill={scoreColor} opacity={0.9} />
            <line x1={barCenter} y1={errTop} x2={barCenter} y2={errBot} stroke="#6b7280" strokeWidth={1} />
            <line x1={barCenter - 3} y1={errTop} x2={barCenter + 3} y2={errTop} stroke="#6b7280" strokeWidth={1} />
            <line x1={barCenter - 3} y1={errBot} x2={barCenter + 3} y2={errBot} stroke="#6b7280" strokeWidth={1} />
            <text x={barCenter} y={y - 4} textAnchor="middle" className="text-[7px] font-mono fill-[#6b7280]">{ev.meanValue.toFixed(1)}</text>
            <text x={barCenter} y={chartHeight - padding.bottom + 14} textAnchor="middle" className="text-[7px] fill-[#9ca3af]">
              {isRepeatability ? `#${ev.index}` : `(${ev.position[0]},${ev.position[1]})`}
            </text>
          </g>
        );
      })}

      {/* Axes */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="#d1d5db" strokeWidth={1} />
      <line x1={padding.left} y1={padding.top + innerH} x2={chartWidth - padding.right} y2={padding.top + innerH} stroke="#d1d5db" strokeWidth={1} />

      <text x={12} y={padding.top + innerH / 2} textAnchor="middle" transform={`rotate(-90, 12, ${padding.top + innerH / 2})`} className="text-[8px] fill-[#9ca3af]">ADC值</text>
      <text x={padding.left + innerW / 2} y={chartHeight - 4} textAnchor="middle" className="text-[8px] fill-[#9ca3af]">
        {isRepeatability ? "按压序号" : "点位坐标"}
      </text>
    </svg>
  );
}

// === Sub-components (White theme) ===

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-blue-300" />
      <span className="text-[11px] font-bold text-gray-700 tracking-wide">{children}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-3.5 py-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 transition-all duration-200">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <span className="text-[11px] font-mono text-gray-700 font-medium">{value}</span>
    </div>
  );
}

function ConditionItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="text-[10px] font-mono text-gray-700">{value}</span>
    </div>
  );
}

function MetricRow({ label, value, status, color }: { label: string; value: string; status: string; color: string }) {
  return (
    <tr className="hover:bg-blue-50/30 transition-colors duration-150">
      <td className="px-4 py-2.5 text-gray-600 font-medium">{label}</td>
      <td className="px-4 py-2.5 text-center font-mono text-gray-800 tabular-nums">{value}</td>
      <td className="px-4 py-2.5 text-right">
        {status !== "-" ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide" style={{ color, backgroundColor: `${color}12`, border: `1px solid ${color}30` }}>{status}</span>
        ) : (
          <span className="text-[10px] text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
}

// === Matrix Schematic (White theme) ===
function MatrixSchematic({ matrixSize, pressEvents, isRepeatability }: {
  matrixSize: string;
  pressEvents: { index: number; position: [number, number] }[];
  isRepeatability: boolean;
}) {
  const match = matrixSize.match(/(\d+)\s*[xX\u00d7]\s*(\d+)/);
  const rows = match ? parseInt(match[1]) : 5;
  const cols = match ? parseInt(match[2]) : 5;

  const testedSet = new Set<string>();
  pressEvents.forEach(ev => {
    testedSet.add(`${ev.position[0]},${ev.position[1]}`);
  });

  const maxGridSize = 110;
  const cellSize = Math.min(Math.floor(maxGridSize / Math.max(rows, cols)), 18);
  const gap = 2;
  const gridW = cols * (cellSize + gap) - gap;
  const gridH = rows * (cellSize + gap) - gap;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[9px] text-gray-400 uppercase tracking-wider font-mono">
        {matrixSize} 矩阵
      </span>
      <div
        className="rounded-lg border border-gray-200 bg-gray-50 p-2.5"
        style={{ width: gridW + 20, height: gridH + 20 }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
            gap: `${gap}px`,
          }}
        >
          {Array.from({ length: rows * cols }, (_, idx) => {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const isTested = testedSet.has(`${r},${c}`);
            return (
              <div
                key={idx}
                className="rounded-[2px] transition-colors duration-300"
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: isTested ? "#22c55e" : "#e5e7eb",
                  boxShadow: isTested ? "0 0 4px rgba(34,197,94,0.4)" : "none",
                }}
                title={`(${r},${c})${isTested ? " ✓" : ""}`}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3 text-[8px] text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px]" style={{ backgroundColor: "#22c55e" }} />
          <span>已测试</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-[1px]" style={{ backgroundColor: "#e5e7eb" }} />
          <span>未测试</span>
        </div>
      </div>
    </div>
  );
}
