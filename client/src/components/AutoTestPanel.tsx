import { useState, useEffect, useCallback, memo } from "react";
import {
  Play,
  Square,
  Settings2,
  ChevronDown,
  ChevronUp,
  Target,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Hash,
  BarChart3,
  MapPin,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { AutoTestConfig, AutoTestProgress, PointComparisonResult, PressEvent, AcceptanceTestType } from "@/lib/auto-test";
import { DEFAULT_AUTO_TEST_CONFIG, loadAutoTestConfig, saveAutoTestConfig, generateSampleId } from "@/lib/auto-test";
import { toast } from "sonner";
interface AutoTestPanelProps {
  isConnected: boolean;
  progress: AutoTestProgress;
  onStartTest: (config: AutoTestConfig, testType: AcceptanceTestType) => void;
  onStopTest: () => void;
  onReset?: () => void;
  onSkipPoint?: () => void;
  onFinishNow?: () => void;
}

/** 单点按压列表项 */
function PressEventItem({ event }: { event: PressEvent }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-background/30 border border-border/30 text-[10px]">
      <span className="font-mono text-jq-blue font-bold w-6">#{event.index}</span>
      <span className="flex items-center gap-0.5 font-mono text-foreground">
        <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
        ({event.position[0]},{event.position[1]})
      </span>
      <span className="font-mono text-cyan-400">{event.meanValue.toFixed(1)}</span>
    </div>
  );
}
/** 对比结果展示 */
function ComparisonResult({ result }: { result: PointComparisonResult }) {
  const testTypeLabel = result.testType === "consistency" ? "一致性" : "重复性";
  return (
    <div className="space-y-3">
      {/* 测试完成摘要 */}
      <div className="text-center py-3 rounded-md bg-background/30 border border-border/30">
        <CheckCircle2 className="w-8 h-8 mx-auto mb-1 text-green-400" />
        <div className="text-lg font-bold text-green-400">测试完成</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {testTypeLabel}{"验收"}{" - "}
          {result.testType === "repeatability" ? `共按压 ${result.pressCount} 次` : `共测试 ${result.pressCount} 个点位`}
        </div>
      </div>
      {/* 各点数据 */}
      <div className="space-y-1">
        <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
          <BarChart3 className="w-3 h-3" />
          {result.testType === "repeatability" ? "各次按压数据对比" : "各点位数据对比"}
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {result.pressEvents.map((evt) => (
            <PressEventItem key={evt.index} event={evt} />
          ))}
        </div>
      </div>
      {/* 导出原始数据CSV */}
      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-[10px] h-7 gap-1"
          onClick={() => {
            // 只导出有效采集的数据（排除被偏移纠错弃置的），重新编号
            const validEvents = result.pressEvents.filter(evt => evt.meanValue > 0 && evt.frameCount > 0);
            const headers = ["序号", "点位行", "点位列", "ADC均值", "ADC标准差", "ADC最大值", "ADC最小值", "采集帧数", "持续时间(s)", "原始序列"];
            const rows = validEvents.map((evt, idx) => [
              idx + 1,
              evt.position[0],
              evt.position[1],
              evt.meanValue.toFixed(2),
              evt.stdValue.toFixed(2),
              evt.maxValue,
              evt.minValue,
              evt.frameCount,
              evt.duration.toFixed(3),
              evt.valueSeries.join(";"),
            ]);
            const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const typeLabel = result.testType === "repeatability" ? "重复性" : "一致性";
            a.download = `${typeLabel}_原始数据_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("原始数据已导出为CSV");
          }}
        >
          <Download className="w-3 h-3" />
          导出原始数据 (CSV)
        </Button>
      </div>
    </div>
  );
}
function AutoTestPanelInner({
  isConnected,
  progress,
  onStartTest,
  onStopTest,
  onReset,
  onSkipPoint,
  onFinishNow,
}: AutoTestPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [config, setConfig] = useState<AutoTestConfig>(loadAutoTestConfig);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testType, setTestType] = useState<AcceptanceTestType>("consistency");
  const isRunning = progress.phase !== "idle" && progress.phase !== "completed" && progress.phase !== "error";
  useEffect(() => {
    saveAutoTestConfig(config);
  }, [config]);
  const handleStart = useCallback(() => {
    if (!isConnected) {
      toast.error("请先连接设备");
      return;
    }
    const testConfig = {
      ...config,
      sampleId: config.sampleId || generateSampleId(),
    };
    setConfig(testConfig);
    onStartTest(testConfig, testType);
  }, [config, isConnected, onStartTest, testType]);
  const phaseLabel: Record<string, string> = {
    idle: "就绪",
    monitoring: "等待按压...",
    pressing: "检测到按压，采集中...",
    waiting: "等待下一次按压...",
    analyzing: "分析中...",
    completed: "测试完成",
    error: "测试出错",
  };
  const phaseColor: Record<string, string> = {
    idle: "text-muted-foreground",
    monitoring: "text-amber-400",
    pressing: "text-cyan-400",
    waiting: "text-amber-400",
    analyzing: "text-jq-blue",
    completed: "text-green-400",
    error: "text-red-400",
  };
  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="industrial-panel-header flex items-center gap-2 w-full text-left cursor-pointer hover:bg-accent/5 transition-colors"
      >
        <Target className="w-3 h-3 text-jq-blue" />
        <span className="flex-1">自动化验收</span>
        {isRunning ? (
          <span className="text-[9px] font-mono text-cyan-400 animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            测试中
          </span>
        ) : (
          <span className="text-[9px] font-mono text-muted-foreground/60">
            待机
          </span>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {expanded && (
        <div className="p-3 space-y-3">
          {/* 验收类型选择 */}
          {(progress.phase === "idle" || progress.phase === "completed" || progress.phase === "error") && (
            <div className="space-y-2.5">
              <div className="text-[10px] text-muted-foreground/80 font-medium tracking-wide uppercase">验收模式</div>
              {/* 高端分段控制器 */}
              <div className="relative p-0.5 rounded-lg bg-gradient-to-r from-jq-blue/10 via-background/60 to-jq-blue/10 border border-industrial-border/50 backdrop-blur-sm shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.03)]">
                {/* 滑动指示器 */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md bg-gradient-to-b from-jq-blue/25 to-jq-blue/15 border border-jq-blue/40 shadow-[0_0_12px_rgba(30,111,217,0.2),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-out"
                  style={{ left: testType === "consistency" ? "2px" : "calc(50% + 2px)" }}
                />
                <div className="relative grid grid-cols-2 gap-0">
                  <button
                    onClick={() => setTestType("consistency")}
                    className={`relative z-10 flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-md text-center transition-all duration-300 ${
                      testType === "consistency"
                        ? "text-jq-blue-bright"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold tracking-tight">一致性</span>
                  </button>
                  <button
                    onClick={() => setTestType("repeatability")}
                    className={`relative z-10 flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-md text-center transition-all duration-300 ${
                      testType === "repeatability"
                        ? "text-jq-blue-bright"
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    }`}
                  >
                    <Target className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold tracking-tight">重复性</span>
                  </button>
                </div>
              </div>
              {/* 描述文字 */}
              <div className="text-[9px] text-muted-foreground/50 leading-relaxed pl-0.5">
                {testType === "consistency"
                  ? "• 验证不同点位在相同压力下输出值的一致程度"
                  : "• 验证同一点位多次按压输出值的稳定程度"}
              </div>
            </div>
          )}
          {/* 流程说明 */}
          {progress.phase === "idle" && (
            <div className="text-[10px] text-muted-foreground/70 leading-relaxed space-y-1.5 bg-background/20 rounded p-2 border border-border/20">
              <p className="font-medium text-foreground/80">
                {testType === "consistency" ? "一致性验收流程:" : "重复性验收流程:"}
              </p>
              <ol className="list-decimal list-inside space-y-0.5 text-[9px]">
                <li>{"点击\"开始验收\"进入监测模式"}</li>
                {testType === "consistency" ? (
                  <>
                    <li>{"用砝码按压传感垫上某个点位，保持至数据稳定"}</li>
                    <li>{"移开砝码，换到另一个位置按压另一个点"}</li>
                    <li>{"至少按压2个不同点位，可按压更多"}</li>
                    <li>{"点击\"结束验收\"查看分析结果"}</li>
                  </>
                ) : (
                  <>
                    <li>{"在任意点位放置砝码，系统自动检测并锁定该点"}</li>
                    <li>{"拿起砝码记录基线值，然后反复按压该点位"}</li>
                    <li>{`重复按压${config.repeatCount}次后自动完成分析`}</li>
                    <li>{"评分结果实时显示在右侧圆环中"}</li>
                  </>
                )}
              </ol>
            </div>
          )}
          {/* 状态显示 */}
          {progress.phase !== "idle" && (
            <div className="space-y-2">
              {/* 当前状态 */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  progress.phase === "pressing" ? "bg-cyan-400 animate-pulse" :
                  progress.phase === "monitoring" || progress.phase === "waiting" ? "bg-amber-400 animate-pulse" :
                  progress.phase === "completed" ? "bg-green-400" :
                  progress.phase === "error" ? "bg-red-400" : "bg-jq-blue animate-pulse"
                }`} />
                <span className={`text-[10px] font-medium ${phaseColor[progress.phase] || "text-foreground"}`}>
                  {phaseLabel[progress.phase] || progress.phase}
                </span>
              </div>
              {/* 消息（biasWarning存在时不显示，避免重复） */}
              {progress.message && !progress.biasWarning && (
                <div className="text-[9px] text-muted-foreground bg-background/20 rounded px-2 py-1 border border-border/20">
                  {progress.message}
                </div>
              )}
              {/* 当前按压点信息 */}
              {progress.phase === "pressing" && progress.currentPoint && (
                <div className="flex items-center gap-3 text-[10px] bg-cyan-500/10 rounded px-2 py-1.5 border border-cyan-500/20">
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-400" />
                    <span className="font-mono text-cyan-400">
                      ({progress.currentPoint[0]},{progress.currentPoint[1]})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/60">ADC</span>
                    <span className="font-mono text-cyan-400">{progress.currentValue.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <Timer className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">{progress.currentDuration.toFixed(1)}s</span>
                  </div>
                </div>
              )}
              {/* 偏置警告 */}
              {progress.biasWarning && (
                <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1.5 border border-red-500/20 animate-pulse">
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span className="font-medium">{progress.biasWarning}</span>
                  </div>
                </div>
              )}
              {/* 重复性逐点进度 */}
              {progress.targetPoint && progress.totalPoints > 0 && (
                <div className="flex items-center gap-3 text-[10px] bg-cyan-500/10 rounded px-2 py-1.5 border border-cyan-500/20">
                  <div className="flex items-center gap-1">
                    <Target className="w-3 h-3 text-cyan-400" />
                    <span className="text-muted-foreground">锁定点:</span>
                    <span className="font-mono text-cyan-400">({progress.targetPoint[0]},{progress.targetPoint[1]})</span>
                  </div>
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-muted-foreground">按压:</span>
                    <span className="font-mono text-foreground">{progress.currentPointPressCount}/{progress.repeatTarget}次</span>
                  </div>
                </div>
              )}
              {/* 已采集次数 */}
              <div className="flex items-center gap-2 text-[10px]">
                <Hash className="w-3 h-3 text-jq-blue" />
                <span className="text-muted-foreground">{"\u5df2\u6309\u538b\u6b21\u6570:"}</span>
                <span className="font-mono font-bold text-foreground">{progress.pressCount}</span>
                {progress.pressCount < 2 && isRunning && !progress.targetPoint && (
                  <span className="text-[9px] text-amber-400/70 ml-auto">{"\u81f3\u5c11\u9700\u89812\u4e2a\u70b9\u4f4d"}</span>
                )}
              </div>
              {/* 已完成的按压列表 */}
              {progress.completedPresses.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-muted-foreground/60">{"\u5404\u6b21\u6309\u538b\u8bb0\u5f55:"}</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {progress.completedPresses.map((evt) => (
                      <PressEventItem key={evt.index} event={evt} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* 分析结果 */}
          {progress.phase === "completed" && progress.result && (
            <ComparisonResult result={progress.result} />
          )}
          {/* 错误信息 */}
          {progress.phase === "error" && progress.error && (
            <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1.5 border border-red-500/20">
              {progress.error}
            </div>
          )}
          {/* 操作按钮 */}
          <div className="flex gap-2">
            {progress.phase === "idle" || progress.phase === "completed" || progress.phase === "error" ? (
              <>
                {(progress.phase === "completed" || progress.phase === "error") && onReset && (
                  <Button
                    onClick={onReset}
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-[10px] font-mono uppercase tracking-wider border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                  >
                    {"\u91cd\u65b0\u6d4b\u8bd5"}
                  </Button>
                )}
                <Button
                  onClick={handleStart}
                  disabled={!isConnected}
                  size="sm"
                  className="flex-1 h-8 text-[10px] font-mono uppercase tracking-wider bg-jq-blue hover:bg-jq-blue-bright text-white"
                >
                  <Play className="w-3 h-3 mr-1.5" />
                  {"\u5f00\u59cb\u9a8c\u6536"}
                </Button>
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-industrial-border">
                      <Settings2 className="w-3 h-3" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md bg-card border-border">
                    <DialogHeader>
                      <DialogTitle className="text-sm">{"验收测试设置"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      {/* 按压检测阈值 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"按压检测阈值 (ADC)"}</label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[config.pressThreshold]}
                            onValueChange={([v]) => setConfig(prev => ({ ...prev, pressThreshold: v }))}
                            min={10}
                            max={100}
                            step={5}
                            className="flex-1"
                          />
                          <span className="text-xs font-mono w-8 text-right">{config.pressThreshold}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground/50">{"ADC值超过此阈值视为有按压"}</p>
                      </div>
                      {/* 最小采样时间 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"最小采样时间 (秒)"}</label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[config.minSampleTime / 1000]}
                            onValueChange={([v]) => setConfig(prev => ({ ...prev, minSampleTime: v * 1000 }))}
                            min={1}
                            max={10}
                            step={0.5}
                            className="flex-1"
                          />
                          <span className="text-xs font-mono w-8 text-right">{(config.minSampleTime / 1000).toFixed(1)}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground/50">{"每个点位至少采集多长时间"}</p>
                      </div>
                      {/* 稳定判定标准差 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"稳定判定标准差"}</label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[config.stableStdThreshold]}
                            onValueChange={([v]) => setConfig(prev => ({ ...prev, stableStdThreshold: v }))}
                            min={2}
                            max={20}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs font-mono w-8 text-right">{config.stableStdThreshold}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground/50">{"ADC值标准差低于此值视为稳定"}</p>
                      </div>
                      {/* 样品编号 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"样品编号"}</label>
                        <input
                          type="text"
                          value={config.sampleId}
                          onChange={(e) => setConfig(prev => ({ ...prev, sampleId: e.target.value }))}
                          placeholder="自动生成"
                          className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                        />
                      </div>
                      {/* 砝码重量 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"\u781d\u7801\u91cd\u91cf (g)"}</label>
                        <input
                          type="text"
                          value={config.weightGrams}
                          onChange={(e) => setConfig(prev => ({ ...prev, weightGrams: e.target.value }))}
                          placeholder="\u5982: 500"
                          className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                        />
                      </div>
                      {/* 重复次数 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"\u91cd\u590d\u6027\u9a8c\u6536\u6bcf\u70b9\u91cd\u590d\u6b21\u6570"}</label>
                        <div className="flex items-center gap-3">
                          <Slider
                            value={[config.repeatCount]}
                            onValueChange={([v]) => setConfig(prev => ({ ...prev, repeatCount: v }))}
                            min={2}
                            max={10}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs font-mono w-8 text-right">{config.repeatCount}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground/50">{"\u6bcf\u4e2a\u70b9\u4f4d\u9700\u8981\u91cd\u590d\u6309\u538b\u7684\u6b21\u6570"}</p>
                      </div>
                      {/* 环境温度 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"\u73af\u5883\u6e29\u5ea6 (°C)"}</label>
                        <input
                          type="text"
                          value={config.temperature}
                          onChange={(e) => setConfig(prev => ({ ...prev, temperature: e.target.value }))}
                          placeholder="\u5982: 25"
                          className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                        />
                      </div>
                      {/* 测试人员 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"\u6d4b\u8bd5\u4eba\u5458"}</label>
                        <input
                          type="text"
                          value={config.operator}
                          onChange={(e) => setConfig(prev => ({ ...prev, operator: e.target.value }))}
                          placeholder="\u53ef\u9009"
                          className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                        />
                      </div>
                      {/* 备注 */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-muted-foreground">{"\u6d4b\u8bd5\u5907\u6ce8"}</label>
                        <input
                          type="text"
                          value={config.notes}
                          onChange={(e) => setConfig(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="\u53ef\u9009"
                          className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                        />
                      </div>

                    </div>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={onStopTest}
                      variant="destructive"
                      size="sm"
                      disabled={progress.phase === "analyzing"}
                      className="flex-1 h-8 text-[10px] font-mono uppercase tracking-wider"
                    >
                      <Square className="w-3 h-3 mr-1.5" />
                      {progress.pressCount >= 2 ? "结束验收" : "取消验收"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {progress.pressCount >= 2
                      ? "结束测试并生成多点对比分析报告"
                      : "至少需要2个点位才能生成分析报告"}
                  </TooltipContent>
                </Tooltip>
                {/* 重复性验收调试按钮 */}
                {testType === "repeatability" && progress.targetPoint && (
                  <div className="flex gap-1 mt-1">
                    <Button
                      onClick={onSkipPoint}
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-[10px] font-mono"
                    >
                      重新选点
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AutoTestPanel = memo(AutoTestPanelInner);
export default AutoTestPanel;
