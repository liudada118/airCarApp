/**
 * 批次管理面板
 * 为每个传感器样品建立独立的测试记录
 * 支持多个样品之间的横向对比分析
 */
import type {
  BasicStats,
  ConsistencyResult,
  RepeatabilityResult,
} from "@/lib/analysis";
import type { MatrixSize } from "@/lib/serial-service";
import {
  type SampleRecord,
  addSample,
  deleteSample,
  exportSamplesCSV,
  generateId,
  loadSamples,
} from "@/lib/batch-manager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Archive,
  BarChart3,
  CheckCircle2,
  Download,
  Package,
  Plus,
  ShieldCheck,
  ShieldX,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

interface BatchPanelProps {
  stats: BasicStats;
  repeatability: RepeatabilityResult;
  consistency: ConsistencyResult;
  matrixSize: MatrixSize;
  isConnected: boolean;
  acceptanceVerdict: "合格" | "异常" | "测试过程异常" | "待定";
}

// ============================================================
// 对比雷达图 (简化版)
// ============================================================

function ComparisonBar({
  samples,
  metricKey,
  label,
  inverted = false,
}: {
  samples: SampleRecord[];
  metricKey: keyof SampleRecord;
  label: string;
  inverted?: boolean;
}) {
  if (samples.length === 0) return null;
  const values = samples.map((s) => Number(s[metricKey]) || 0);
  const maxVal = Math.max(...values, 1);
  const colors = ["#1e6fd9", "#00d4c8", "#a78bfa", "#f59e0b", "#ef4444", "#4ade80"];

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[9px] text-muted-foreground">{label}</span>
        {inverted && <span className="text-[7px] text-muted-foreground/40">↓越小越好</span>}
      </div>
      {samples.map((s, i) => {
        const val = Number(s[metricKey]) || 0;
        const pct = (val / maxVal) * 100;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className="text-[7px] text-muted-foreground/60 w-12 truncate">{s.name}</span>
            <div className="flex-1 h-2 bg-background/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: colors[i % colors.length],
                }}
              />
            </div>
            <span className="text-[8px] font-mono w-10 text-right" style={{ color: colors[i % colors.length] }}>
              {val.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================

export default function BatchPanel({
  stats,
  repeatability,
  consistency,
  matrixSize,
  isConnected,
  acceptanceVerdict,
}: BatchPanelProps) {
  const [samples, setSamples] = useState<SampleRecord[]>(loadSamples);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [sampleName, setSampleName] = useState("");
  const [batchId, setBatchId] = useState(() => {
    const now = new Date();
    return `B${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  });
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 获取选中的样品用于对比
  const selectedSamples = useMemo(
    () => samples.filter((s) => selectedIds.has(s.id)),
    [samples, selectedIds],
  );

  // 保存当前测试为样品记录
  const handleSaveSample = useCallback(() => {
    if (!sampleName.trim()) {
      toast.error("请输入样品名称");
      return;
    }

    const record: SampleRecord = {
      id: generateId(),
      name: sampleName.trim(),
      batchId: batchId.trim() || "默认批次",
      matrixSize,
      createdAt: new Date().toISOString(),
      testedAt: new Date().toLocaleString("zh-CN"),
      repeatabilityER: repeatability.errorFSO,
      repeatabilityScore: repeatability.score,
      repeatabilityGrade: repeatability.grade,
      consistencyScore: consistency.score,
      consistencyGrade: consistency.grade,
      activeRate: stats.activeRate,
      mean: stats.mean,
      std: stats.std,
      verdict: acceptanceVerdict,
      notes: notes.trim(),
    };

    const updated = addSample(record);
    setSamples(updated);
    setDialogOpen(false);
    setSampleName("");
    setNotes("");
    toast.success(`样品 "${record.name}" 已保存`);
  }, [sampleName, batchId, notes, matrixSize, repeatability, consistency, stats, acceptanceVerdict]);

  // 删除样品
  const handleDelete = useCallback((id: string) => {
    const updated = deleteSample(id);
    setSamples(updated);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast.success("样品记录已删除");
  }, []);

  // 导出CSV
  const handleExportCSV = useCallback(() => {
    const csv = exportSamplesCSV(samples);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch_samples_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("批次数据已导出");
  }, [samples]);

  // 切换选中
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      {/* Header */}
      <div className="industrial-panel-header flex items-center gap-2">
        <Package className="w-3 h-3" />
        <span>批次管理</span>
        <span className="text-[8px] text-muted-foreground/50 ml-auto">Batch</span>
      </div>

      <div className="p-2 space-y-2">
        {/* Action buttons */}
        <div className="flex gap-1.5">
          {isConnected && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[9px] font-mono border-jq-blue/30 hover:border-jq-blue/60"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  保存样品
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-sm flex items-center gap-2">
                    <Archive className="w-4 h-4 text-jq-blue" />
                    保存当前测试数据
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">样品名称 *</label>
                    <input
                      type="text"
                      value={sampleName}
                      onChange={(e) => setSampleName(e.target.value)}
                      placeholder="例如: S001-A"
                      className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">批次号</label>
                    <input
                      type="text"
                      value={batchId}
                      onChange={(e) => setBatchId(e.target.value)}
                      placeholder="例如: B20260410"
                      className="w-full h-8 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">备注</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="可选备注信息..."
                      rows={2}
                      className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-xs text-foreground focus:border-jq-blue focus:outline-none resize-none"
                    />
                  </div>

                  {/* Preview current metrics */}
                  <div className="bg-background/30 rounded p-2 space-y-1">
                    <div className="text-[9px] text-muted-foreground/60 mb-1">当前测试数据预览</div>
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
                      <span className="text-muted-foreground">重复性 eR:</span>
                      <span className="text-jq-blue-bright">±{repeatability.errorFSO.toFixed(2)}%</span>
                      <span className="text-muted-foreground">一致性:</span>
                      <span className="text-jq-blue-bright">{consistency.score.toFixed(1)}分</span>
                      <span className="text-muted-foreground">验收结论:</span>
                      <span style={{ color: acceptanceVerdict === "合格" ? "#4ade80" : (acceptanceVerdict === "异常" || acceptanceVerdict === "测试过程异常") ? "#ef4444" : "#f59e0b" }}>
                        {acceptanceVerdict}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDialogOpen(false)}
                      className="flex-1 text-[10px]"
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveSample}
                      className="flex-1 text-[10px] bg-jq-blue hover:bg-jq-blue-bright"
                    >
                      保存
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {selectedSamples.length >= 2 && (
            <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[9px] font-mono border-cyan-500/30 hover:border-cyan-500/60"
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  对比({selectedSamples.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" />
                    样品横向对比分析
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  {/* Summary table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-[9px] font-mono">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left py-1 px-1 text-muted-foreground">样品</th>
                          <th className="text-right py-1 px-1 text-muted-foreground">eR%</th>
                          <th className="text-right py-1 px-1 text-muted-foreground">一致性</th>
                          <th className="text-right py-1 px-1 text-muted-foreground">活跃率</th>
                          <th className="text-center py-1 px-1 text-muted-foreground">结论</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSamples.map((s) => (
                          <tr key={s.id} className="border-b border-border/20">
                            <td className="py-1.5 px-1 text-foreground">{s.name}</td>
                            <td className="py-1.5 px-1 text-right text-jq-blue-bright">{s.repeatabilityER.toFixed(2)}</td>
                            <td className="py-1.5 px-1 text-right text-cyan-glow">{s.consistencyScore.toFixed(1)}</td>
                            <td className="py-1.5 px-1 text-right text-muted-foreground">{s.activeRate.toFixed(1)}%</td>
                            <td className="py-1.5 px-1 text-center">
                              {s.verdict === "合格" ? (
                                <CheckCircle2 className="w-3 h-3 text-green-400 inline" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-400 inline" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Comparison bars */}
                  <div className="space-y-3">
                    <ComparisonBar samples={selectedSamples} metricKey="repeatabilityER" label="重复性 eR (%FSO)" inverted />
                    <ComparisonBar samples={selectedSamples} metricKey="consistencyScore" label="一致性评分" />
                    <ComparisonBar samples={selectedSamples} metricKey="activeRate" label="活跃点比率 (%)" />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {samples.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-7 text-[9px] font-mono border-border/50"
            >
              <Download className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Sample list */}
        {samples.length > 0 ? (
          <ScrollArea className="max-h-40">
            <div className="space-y-1">
              {samples.map((s) => {
                const isSelected = selectedIds.has(s.id);
                return (
                  <div
                    key={s.id}
                    className={`rounded p-1.5 border transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-jq-blue/10 border-jq-blue/40"
                        : "bg-background/20 border-border/30 hover:border-border/60"
                    }`}
                    onClick={() => toggleSelect(s.id)}
                  >
                    <div className="flex items-center gap-1.5">
                      {/* Checkbox indicator */}
                      <div
                        className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-jq-blue border-jq-blue" : "border-border/60"
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-2 h-2 text-white" />}
                      </div>

                      {/* Verdict icon */}
                      {s.verdict === "合格" ? (
                        <ShieldCheck className="w-3 h-3 text-green-400 shrink-0" />
                      ) : (
                        <ShieldX className="w-3 h-3 text-red-400 shrink-0" />
                      )}

                      {/* Name and batch */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-medium text-foreground truncate">{s.name}</div>
                        <div className="text-[7px] text-muted-foreground/50">{s.batchId} · {s.matrixSize}</div>
                      </div>

                      {/* Score */}
                      <span className="text-[9px] font-mono text-jq-blue-bright shrink-0">
                        {s.consistencyScore.toFixed(0)}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id);
                        }}
                        className="w-4 h-4 flex items-center justify-center rounded hover:bg-red-500/20 transition-colors shrink-0"
                      >
                        <Trash2 className="w-2.5 h-2.5 text-muted-foreground/40 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-3 text-[9px] text-muted-foreground/40">
            暂无样品记录
            <br />
            连接设备后可保存测试数据
          </div>
        )}

        {/* Footer info */}
        {samples.length > 0 && (
          <div className="text-[8px] text-muted-foreground/40 flex justify-between pt-1 border-t border-border/20">
            <span>共 {samples.length} 个样品</span>
            <span>选中 {selectedIds.size} 个对比</span>
          </div>
        )}
      </div>
    </div>
  );
}
