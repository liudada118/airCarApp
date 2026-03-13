/**
 * Design: Command combo manager with loop repeat support
 * Create sequences of saved commands with configurable delays
 * Supports infinite loop execution until manually stopped
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useSerialContext } from "@/contexts/SerialContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { hexToBytes, type CommandStep, type CommandCombo } from "@/lib/protocol";
import {
  Plus,
  Trash2,
  Play,
  Square,
  ArrowDown,
  Clock,
  Combine,
  GripVertical,
  Repeat,
  Infinity,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function ComboManager() {
  const { commands, combos, addCombo, removeCombo, updateCombo, send, isConnected } =
    useSerialContext();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSteps, setNewSteps] = useState<CommandStep[]>([]);
  const [runningComboId, setRunningComboId] = useState<string | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [loopCount, setLoopCount] = useState(0);
  const [isLoopMode, setIsLoopMode] = useState<Record<string, boolean>>({});
  const abortRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const addStep = () => {
    if (commands.length === 0) {
      toast.error("请先在指令管理中保存指令");
      return;
    }
    setNewSteps((prev) => [
      ...prev,
      { commandId: commands[0].id, delayAfterMs: 500 },
    ]);
  };

  const removeStep = (idx: number) => {
    setNewSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateStep = (idx: number, updates: Partial<CommandStep>) => {
    setNewSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...updates } : s))
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("请输入组合名称");
      return;
    }
    if (newSteps.length === 0) {
      toast.error("请至少添加一个步骤");
      return;
    }
    addCombo({ name: newName.trim(), steps: newSteps });
    setNewName("");
    setNewSteps([]);
    setIsCreating(false);
    toast.success("指令组合已创建");
  };

  const toggleLoopMode = (comboId: string) => {
    setIsLoopMode((prev) => ({ ...prev, [comboId]: !prev[comboId] }));
  };

  // Execute one round of the combo, returns false if aborted
  const executeOneRound = useCallback(
    async (combo: CommandCombo): Promise<boolean> => {
      for (let i = 0; i < combo.steps.length; i++) {
        if (abortRef.current) return false;
        setCurrentStepIdx(i);

        const step = combo.steps[i];
        const cmd = commands.find((c) => c.id === step.commandId);
        if (!cmd) {
          toast.error(`步骤 ${i + 1}: 指令不存在`);
          continue;
        }

        const bytes = hexToBytes(cmd.rawHex.replace(/\s/g, ""));
        await send(bytes);

        // Wait for delay
        if (step.delayAfterMs > 0 && i < combo.steps.length - 1) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, step.delayAfterMs);
            const check = setInterval(() => {
              if (abortRef.current) {
                clearTimeout(timer);
                clearInterval(check);
                resolve();
              }
            }, 50);
          });
        }
      }

      // Delay after last step before next loop
      if (!abortRef.current && combo.steps.length > 0) {
        const lastStep = combo.steps[combo.steps.length - 1];
        if (lastStep.delayAfterMs > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, lastStep.delayAfterMs);
            const check = setInterval(() => {
              if (abortRef.current) {
                clearTimeout(timer);
                clearInterval(check);
                resolve();
              }
            }, 50);
          });
        }
      }

      return !abortRef.current;
    },
    [commands, send]
  );

  const runCombo = useCallback(
    async (combo: CommandCombo, loop: boolean) => {
      abortRef.current = false;
      setRunningComboId(combo.id);
      setLoopCount(0);

      if (loop) {
        // Infinite loop mode
        let round = 0;
        while (!abortRef.current) {
          round++;
          setLoopCount(round);
          const ok = await executeOneRound(combo);
          if (!ok) break;
        }
      } else {
        // Single execution
        setLoopCount(1);
        await executeOneRound(combo);
      }

      setRunningComboId(null);
      setCurrentStepIdx(-1);
      setLoopCount(0);
      if (!abortRef.current) {
        toast.success(`组合 "${combo.name}" 执行完成`);
      }
    },
    [executeOneRound]
  );

  const stopCombo = () => {
    abortRef.current = true;
    setRunningComboId(null);
    setCurrentStepIdx(-1);
    setLoopCount(0);
    toast.info("已停止执行");
  };

  const getCommandName = (id: string) =>
    commands.find((c) => c.id === id)?.name ?? "未知指令";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-[Space_Grotesk] font-semibold">
          指令组合
          <span className="text-sm text-muted-foreground font-normal ml-2">
            ({combos.length})
          </span>
        </h2>
        <Button
          size="sm"
          onClick={() => setIsCreating(!isCreating)}
          className="gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          新建组合
        </Button>
      </div>

      {/* Create new combo */}
      {isCreating && (
        <Card className="bg-card border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-[Space_Grotesk]">新建指令组合</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="组合名称"
              className="h-9 text-sm"
            />

            {/* Steps */}
            <div className="space-y-2">
              {newSteps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/30 border border-border"
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0 w-6">
                    {idx + 1}.
                  </span>
                  <Select
                    value={step.commandId}
                    onValueChange={(v) => updateStep(idx, { commandId: v })}
                  >
                    <SelectTrigger className="flex-1 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {commands.map((cmd) => (
                        <SelectItem key={cmd.id} value={cmd.id}>
                          {cmd.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <Input
                      type="number"
                      value={step.delayAfterMs}
                      onChange={(e) =>
                        updateStep(idx, { delayAfterMs: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-20 h-7 text-xs"
                      min={0}
                      step={100}
                    />
                    <span className="text-[10px] text-muted-foreground">ms</span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeStep(idx)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}

              {newSteps.length > 0 && newSteps.length < commands.length && (
                <div className="flex justify-center">
                  <ArrowDown className="w-4 h-4 text-muted-foreground" />
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={addStep}
                className="w-full text-xs gap-1 border-dashed"
                disabled={commands.length === 0}
              >
                <Plus className="w-3 h-3" />
                添加步骤
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsCreating(false);
                  setNewSteps([]);
                  setNewName("");
                }}
                className="text-xs"
              >
                取消
              </Button>
              <Button size="sm" onClick={handleCreate} className="text-xs">
                创建组合
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing combos */}
      {combos.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
            <Combine className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-[Space_Grotesk] font-semibold mb-2">暂无指令组合</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            将多个已保存的指令组合成序列，设置每步之间的间隔时间，实现自动化发送
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {combos.map((combo) => {
            const isRunning = runningComboId === combo.id;
            const loopEnabled = isLoopMode[combo.id] ?? false;

            return (
              <Card
                key={combo.id}
                className={cn(
                  "bg-card border-border transition-all",
                  isRunning && "border-primary/50 shadow-[0_0_15px_-5px] shadow-primary/30"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold font-[Space_Grotesk]">{combo.name}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {combo.steps.length} 个步骤 · {new Date(combo.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* Loop toggle button */}
                      {!isRunning && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleLoopMode(combo.id)}
                          className={cn(
                            "gap-1 text-xs h-8 px-2.5 transition-all",
                            loopEnabled
                              ? "border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-300"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          title={loopEnabled ? "循环模式已开启" : "点击开启循环模式"}
                        >
                          {loopEnabled ? (
                            <Infinity className="w-3.5 h-3.5" />
                          ) : (
                            <Repeat className="w-3.5 h-3.5" />
                          )}
                          {loopEnabled ? "循环" : "单次"}
                        </Button>
                      )}

                      {isRunning ? (
                        <div className="flex items-center gap-2">
                          {/* Loop counter badge */}
                          {loopEnabled && loopCount > 0 && (
                            <Badge
                              variant="outline"
                              className="border-primary/40 text-primary font-mono text-xs animate-pulse"
                            >
                              第 {loopCount} 轮
                            </Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={stopCombo}
                            className="gap-1 text-xs border-destructive/40 text-destructive hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Square className="w-3 h-3" />
                            停止
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => runCombo(combo, loopEnabled)}
                          disabled={!isConnected || runningComboId !== null}
                          className={cn(
                            "gap-1 text-xs",
                            loopEnabled ? "bg-amber-600 hover:bg-amber-500" : "bg-primary"
                          )}
                        >
                          <Play className="w-3 h-3" />
                          {loopEnabled ? "循环执行" : "执行"}
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            disabled={isRunning}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除组合 "{combo.name}" 吗？
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => removeCombo(combo.id)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Running status bar */}
                  {isRunning && (
                    <div className="mb-3 p-2.5 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-xs text-primary font-medium">
                            {loopEnabled ? "循环执行中" : "执行中"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {loopEnabled && (
                            <span className="font-mono">
                              轮次: <span className="text-primary">{loopCount}</span>
                            </span>
                          )}
                          <span className="font-mono">
                            步骤: <span className="text-primary">{currentStepIdx + 1}</span>/{combo.steps.length}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Steps visualization */}
                  <div className="space-y-1">
                    {combo.steps.map((step, idx) => {
                      const isCurrentStep = isRunning && currentStepIdx === idx;
                      return (
                        <div key={idx}>
                          <div
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg transition-all",
                              isCurrentStep
                                ? "bg-primary/15 border border-primary/30"
                                : "bg-accent/20"
                            )}
                          >
                            <span
                              className={cn(
                                "text-xs font-mono w-5 text-center shrink-0",
                                isCurrentStep ? "text-primary" : "text-muted-foreground"
                              )}
                            >
                              {idx + 1}
                            </span>
                            <span className="text-xs flex-1 truncate">
                              {getCommandName(step.commandId)}
                            </span>
                            {isCurrentStep && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                          </div>
                          {idx < combo.steps.length - 1 && (
                            <div className="flex items-center gap-1 pl-6 py-0.5">
                              <div className="w-px h-3 bg-border ml-2" />
                              <Clock className="w-2.5 h-2.5 text-muted-foreground ml-1" />
                              <span className="text-[10px] text-muted-foreground">
                                {step.delayAfterMs}ms
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Show loop indicator at the end */}
                    {loopEnabled && !isRunning && (
                      <div className="flex items-center gap-1.5 pl-6 py-1 mt-1">
                        <div className="w-px h-3 bg-amber-500/30 ml-2" />
                        <Repeat className="w-2.5 h-2.5 text-amber-500/60 ml-1" />
                        <span className="text-[10px] text-amber-500/60">
                          循环回到步骤 1（最后一步延迟 {combo.steps[combo.steps.length - 1]?.delayAfterMs ?? 0}ms 后）
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
