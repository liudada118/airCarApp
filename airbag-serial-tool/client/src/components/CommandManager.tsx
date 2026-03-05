/**
 * Design: Command management panel
 * List saved commands, send with frequency control, repeat options
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useSerialContext } from "@/contexts/SerialContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
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
import {
  hexToBytes,
  GEAR_LABELS,
  GEAR_COLORS,
  GearLevel,
  type SavedCommand,
  type SendOptions,
} from "@/lib/protocol";
import { Send, Trash2, Square, Play, Clock, Repeat, Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CommandManager() {
  const { commands, removeCommand, updateCommand, send, isConnected } = useSerialContext();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendOptions, setSendOptions] = useState<Record<string, SendOptions>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const intervalRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const countRef = useRef<Record<string, number>>({});

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      Object.values(intervalRef.current).forEach(clearInterval);
    };
  }, []);

  const getOptions = (id: string): SendOptions =>
    sendOptions[id] ?? { repeat: false, intervalMs: 500, count: 0 };

  const setOption = (id: string, updates: Partial<SendOptions>) => {
    setSendOptions((prev) => ({
      ...prev,
      [id]: { ...getOptions(id), ...updates },
    }));
  };

  const handleSend = useCallback(
    async (cmd: SavedCommand) => {
      const bytes = hexToBytes(cmd.rawHex.replace(/\s/g, ""));
      await send(bytes);
    },
    [send]
  );

  const handleSendOnce = useCallback(
    async (cmd: SavedCommand) => {
      await handleSend(cmd);
      toast.success(`已发送: ${cmd.name}`);
    },
    [handleSend]
  );

  const startRepeatSend = useCallback(
    (cmd: SavedCommand) => {
      const opts = getOptions(cmd.id);
      setSendingId(cmd.id);
      countRef.current[cmd.id] = 0;

      // Send immediately first time
      handleSend(cmd);
      countRef.current[cmd.id]++;

      const interval = setInterval(() => {
        if (opts.count > 0 && countRef.current[cmd.id] >= opts.count) {
          clearInterval(intervalRef.current[cmd.id]);
          delete intervalRef.current[cmd.id];
          setSendingId(null);
          toast.success(`${cmd.name}: 已完成 ${opts.count} 次发送`);
          return;
        }
        handleSend(cmd);
        countRef.current[cmd.id]++;
      }, opts.intervalMs);

      intervalRef.current[cmd.id] = interval;
      toast.info(`开始重复发送: ${cmd.name}`);
    },
    [handleSend, sendOptions]
  );

  const stopRepeatSend = useCallback((cmdId: string) => {
    if (intervalRef.current[cmdId]) {
      clearInterval(intervalRef.current[cmdId]);
      delete intervalRef.current[cmdId];
    }
    setSendingId(null);
    toast.info("已停止发送");
  }, []);

  const startEditing = (cmd: SavedCommand) => {
    setEditingId(cmd.id);
    setEditName(cmd.name);
  };

  const confirmEdit = (id: string) => {
    if (editName.trim()) {
      updateCommand(id, { name: editName.trim() });
    }
    setEditingId(null);
  };

  const getActiveAirbags = (cmd: SavedCommand) => {
    return cmd.frame.airbags.filter((a) => a.gear !== GearLevel.Stop).slice(0, 10);
  };

  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-accent/50 flex items-center justify-center mb-4">
          <Send className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-[Space_Grotesk] font-semibold mb-2">暂无保存的指令</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          在"气囊控制"页面配置气囊状态后，点击"保存指令"按钮将指令保存到此处
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-[Space_Grotesk] font-semibold">
          已保存指令
          <span className="text-sm text-muted-foreground font-normal ml-2">
            ({commands.length})
          </span>
        </h2>
      </div>

      <div className="grid gap-3">
        {commands.map((cmd) => {
          const opts = getOptions(cmd.id);
          const isSending = sendingId === cmd.id;
          const activeAirbags = getActiveAirbags(cmd);

          return (
            <Card
              key={cmd.id}
              className={cn(
                "bg-card border-border transition-all duration-200",
                isSending && "border-primary/50 shadow-[0_0_15px_-5px] shadow-primary/30"
              )}
            >
              <CardContent className="p-4">
                {/* Header row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {editingId === cmd.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm w-48"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && confirmEdit(cmd.id)}
                        />
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => confirmEdit(cmd.id)}>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold font-[Space_Grotesk]">{cmd.name}</h3>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEditing(cmd)}>
                          <Edit2 className="w-3 h-3 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(cmd.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isSending ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => stopRepeatSend(cmd.id)}
                        className="gap-1 text-xs border-destructive/40 text-destructive"
                      >
                        <Square className="w-3 h-3" />
                        停止
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendOnce(cmd)}
                          disabled={!isConnected || sendingId !== null}
                          className="gap-1 text-xs"
                        >
                          <Send className="w-3 h-3" />
                          发送
                        </Button>
                        {opts.repeat && (
                          <Button
                            size="sm"
                            onClick={() => startRepeatSend(cmd)}
                            disabled={!isConnected || sendingId !== null}
                            className="gap-1 text-xs bg-primary"
                          >
                            <Play className="w-3 h-3" />
                            重复发送
                          </Button>
                        )}
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除</AlertDialogTitle>
                          <AlertDialogDescription>
                            确定要删除指令 "{cmd.name}" 吗？此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeCommand(cmd.id)}>
                            删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Active airbags badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {activeAirbags.length > 0 ? (
                    activeAirbags.map((a) => (
                      <Badge
                        key={a.id}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                        style={{
                          borderColor: GEAR_COLORS[a.gear],
                          color: GEAR_COLORS[a.gear],
                        }}
                      >
                        气囊{a.id}: {GEAR_LABELS[a.gear]}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                      全部保压
                    </Badge>
                  )}
                </div>

                {/* Hex preview */}
                <div className="p-2 rounded bg-background border border-border mb-3 overflow-x-auto">
                  <code className="hex-display text-primary/80 text-[11px] break-all">
                    {cmd.rawHex}
                  </code>
                </div>

                {/* Send options */}
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={opts.repeat}
                      onCheckedChange={(v) => setOption(cmd.id, { repeat: v })}
                      className="scale-90"
                    />
                    <Label className="text-xs text-muted-foreground">
                      <Repeat className="w-3 h-3 inline mr-1" />
                      重复发送
                    </Label>
                  </div>

                  {opts.repeat && (
                    <>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">间隔</span>
                        <Input
                          type="number"
                          value={opts.intervalMs}
                          onChange={(e) =>
                            setOption(cmd.id, { intervalMs: Math.max(50, Number(e.target.value)) })
                          }
                          className="w-20 h-7 text-xs"
                          min={50}
                          step={50}
                        />
                        <span className="text-xs text-muted-foreground">ms</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">次数</span>
                        <Input
                          type="number"
                          value={opts.count}
                          onChange={(e) =>
                            setOption(cmd.id, { count: Math.max(0, Number(e.target.value)) })
                          }
                          className="w-16 h-7 text-xs"
                          min={0}
                        />
                        <span className="text-[10px] text-muted-foreground">(0=无限)</span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
