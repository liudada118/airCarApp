/**
 * 验收合格判定面板
 * 显示各项指标的判定结果和总体结论
 * 支持自定义阈值配置
 */
import {
  type AcceptanceConfig,
  type AcceptanceResult,
  type ThresholdRule,
  DEFAULT_ACCEPTANCE_CONFIG,
  evaluateAcceptance,
  loadAcceptanceConfig,
  saveAcceptanceConfig,
} from "@/lib/acceptance";
import type {
  BasicStats,
  ConsistencyResult,
  RepeatabilityResult,
} from "@/lib/analysis";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2,
  XCircle,
  Settings,
  Shield,
  ShieldCheck,
  ShieldX,
  RotateCcw,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface AcceptancePanelProps {
  stats: BasicStats;
  repeatability: RepeatabilityResult;
  consistency: ConsistencyResult;
  isConnected: boolean;
}

function ThresholdRow({
  rule,
  onChange,
}: {
  rule: ThresholdRule;
  onChange: (field: "excellent" | "good" | "fair", value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-foreground">{rule.name}</span>
        <span className="text-[9px] text-muted-foreground">
          {rule.unit} {rule.inverted ? "↓越小越好" : "↑越大越好"}
        </span>
      </div>
      <div className="text-[9px] text-muted-foreground/60 mb-1">{rule.description}</div>
      <div className="grid grid-cols-3 gap-2">
        {(["excellent", "good", "fair"] as const).map((level) => {
          const labels: Record<string, string> = { excellent: "优秀", good: "良好", fair: "异常" };
          const colors: Record<string, string> = { excellent: "text-green-400", good: "text-blue-400", fair: "text-amber-400" };
          return (
            <div key={level} className="space-y-0.5">
              <label className={`text-[9px] ${colors[level]}`}>
                {labels[level]} {rule.inverted ? "≤" : "≥"}
              </label>
              <input
                type="number"
                value={rule[level]}
                onChange={(e) => onChange(level, parseFloat(e.target.value) || 0)}
                className="w-full h-6 bg-background/50 border border-border rounded px-1.5 text-[10px] font-mono text-foreground focus:border-jq-blue focus:outline-none"
                step={5}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AcceptancePanelInner({
  stats,
  repeatability,
  consistency,
  isConnected,
}: AcceptancePanelProps) {
  const [config, setConfig] = useState<AcceptanceConfig>(loadAcceptanceConfig);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState<AcceptanceConfig>(config);

  const result: AcceptanceResult | null = useMemo(() => {
    if (!isConnected) return null;
    return evaluateAcceptance(config, {
      repeatabilityScore: repeatability.score,
      consistencyScore: consistency.score,
    });
  }, [config, repeatability.score, consistency.score, isConnected]);

  useEffect(() => {
    if (dialogOpen) {
      setTempConfig({ ...config });
    }
  }, [dialogOpen, config]);

  const handleSaveConfig = useCallback(() => {
    setConfig(tempConfig);
    saveAcceptanceConfig(tempConfig);
    setDialogOpen(false);
    toast.success("验收规则已保存");
  }, [tempConfig]);

  const handleResetConfig = useCallback(() => {
    setTempConfig({ ...DEFAULT_ACCEPTANCE_CONFIG });
  }, []);

  const updateRule = useCallback(
    (ruleKey: keyof Pick<AcceptanceConfig, "repeatabilityScore" | "consistencyScore">, field: "excellent" | "good" | "fair", value: number) => {
      setTempConfig((prev) => ({
        ...prev,
        [ruleKey]: { ...prev[ruleKey], [field]: value },
      }));
    },
    [],
  );

  if (!isConnected || !result) {
    return null;
  }

  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      <div className="industrial-panel-header flex items-center gap-2">
        <Shield className="w-3 h-3" />
        <span>验收判定</span>
        <span className="text-[8px] text-muted-foreground/50 ml-auto">Acceptance</span>
      </div>

      <div className="p-3 space-y-2.5">
        <div
          className="rounded-md p-3 flex items-center gap-3 border"
          style={{
            backgroundColor: result.verdictColor + "10",
            borderColor: result.verdictColor + "40",
          }}
        >
          {result.verdict === "合格" ? (
            <ShieldCheck className="w-8 h-8 shrink-0" style={{ color: result.verdictColor }} />
          ) : (
            <ShieldX className="w-8 h-8 shrink-0" style={{ color: result.verdictColor }} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono led-text" style={{ color: result.verdictColor }}>
                {result.verdict}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {result.passedCount}/{result.totalCount} 项达标
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5 leading-relaxed break-words">
              {result.summary}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {result.indicators.map((ind) => (
            <div key={ind.key} className="flex items-center gap-2 bg-background/30 rounded px-2 py-1.5">
              {ind.passed ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: ind.color }} />
              ) : (
                <XCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
              )}
              <span className="text-[10px] text-muted-foreground flex-1 truncate">{ind.name}</span>
              <span className="text-[10px] font-mono font-semibold shrink-0" style={{ color: ind.color }}>
                {ind.value.toFixed(1)}{ind.unit}
              </span>
              <span
                className={`text-[8px] font-mono px-1 py-0.5 rounded border shrink-0 ${
                  ind.passed
                    ? "border-green-500/30 text-green-400 bg-green-500/10"
                    : "border-red-500/30 text-red-400 bg-red-500/10"
                }`}
              >
                {ind.grade}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <span className="text-[9px] text-muted-foreground/50">
            {config.strictMode ? "严格模式: 全部达标" : `宽松模式: ≥${config.minPassCount}项达标`}
          </span>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-1 text-[9px] text-jq-blue hover:text-jq-blue-bright transition-colors">
                <Settings className="w-3 h-3" />
                设置规则
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-jq-blue" />
                  验收判定规则设置
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="flex items-center justify-between bg-background/30 rounded-md p-3">
                  <div>
                    <div className="text-[11px] font-medium">严格模式</div>
                    <div className="text-[9px] text-muted-foreground">
                      {tempConfig.strictMode ? "所有指标必须达到'一般'及以上" : `至少 ${tempConfig.minPassCount} 项达标即可`}
                    </div>
                  </div>
                  <Switch
                    checked={tempConfig.strictMode}
                    onCheckedChange={(checked) => setTempConfig((prev) => ({ ...prev, strictMode: checked }))}
                  />
                </div>
                {!tempConfig.strictMode && (
                  <div className="flex items-center gap-3 bg-background/30 rounded-md p-3">
                    <span className="text-[10px] text-muted-foreground flex-1">最低通过指标数</span>
                    <div className="flex items-center gap-1">
                      {[1, 2].map((n) => (
                        <button
                          key={n}
                          onClick={() => setTempConfig((prev) => ({ ...prev, minPassCount: n }))}
                          className={`w-7 h-7 text-[10px] font-mono rounded border transition-colors ${
                            tempConfig.minPassCount === n
                              ? "bg-jq-blue/20 border-jq-blue/50 text-jq-blue-bright"
                              : "bg-background/30 border-border/50 text-muted-foreground hover:border-jq-blue/30"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <ThresholdRow rule={tempConfig.repeatabilityScore} onChange={(field, value) => updateRule("repeatabilityScore", field, value)} />
                  <ThresholdRow rule={tempConfig.consistencyScore} onChange={(field, value) => updateRule("consistencyScore", field, value)} />
                </div>
                <div className="flex gap-2 pt-2 border-t border-border/30">
                  <Button variant="outline" size="sm" onClick={handleResetConfig} className="text-[10px]">
                    <RotateCcw className="w-3 h-3 mr-1" />
                    恢复默认
                  </Button>
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[10px]">
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveConfig} className="text-[10px] bg-jq-blue hover:bg-jq-blue-bright">
                    保存规则
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

const AcceptancePanel = memo(AcceptancePanelInner);
export default AcceptancePanel;
