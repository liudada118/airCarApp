/**
 * Design: Dark Tech Dashboard — Communication log with real-time data display
 * Shows send/receive logs with parsed frame details
 * Terminal-style display with color-coded entries
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { useSerialContext } from "@/contexts/SerialContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  GEAR_LABELS,
  GEAR_COLORS,
  GearLevel,
  WorkMode,
  DataDirection,
  formatParsedFrame,
  type LogEntry,
} from "@/lib/protocol";
import {
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ScrollText,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

type FilterType = "all" | "send" | "receive";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

export default function CommLog() {
  const { logs, clearLogs, lastReceived } = useSerialContext();
  const [filter, setFilter] = useState<FilterType>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => l.direction === filter);
  }, [logs, filter]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportLogs = () => {
    const lines = logs.map((l) => {
      const time = new Date(l.timestamp).toISOString();
      const dir = l.direction === "send" ? "TX" : "RX";
      const parsed = l.parsed ? formatParsedFrame(l.parsed) : l.error || "";
      return `[${time}] [${dir}] ${l.rawHex} ${parsed}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serial_log_${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Last received frame summary */}
      {lastReceived && (
        <Card className="bg-card border-border shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-[Space_Grotesk] font-semibold flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              最新从机反馈
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-4 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">工作模式:</span>
                <Badge variant="outline" className="text-xs">
                  {lastReceived.workMode === WorkMode.Auto ? "自动" : "手动"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">方向:</span>
                <Badge variant="outline" className="text-xs">
                  {lastReceived.direction === DataDirection.Receive ? "上传" : "下发"}
                </Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lastReceived.airbags
                .filter((a) => a.gear !== GearLevel.Stop)
                .slice(0, 10)
                .map((a) => (
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
                ))}
              {lastReceived.airbags.filter((a) => a.gear !== GearLevel.Stop).length === 0 && (
                <span className="text-xs text-muted-foreground">全部保压/停止</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log panel */}
      <Card className="bg-card border-border flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-[Space_Grotesk] font-semibold">
              通信日志
              <span className="text-muted-foreground font-normal ml-2">
                ({filteredLogs.length})
              </span>
            </CardTitle>
            <div className="flex items-center gap-3">
              {/* Filter */}
              <div className="flex items-center gap-0.5 bg-accent/50 rounded-lg p-0.5">
                {(["all", "send", "receive"] as FilterType[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                      filter === f
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "all" ? "全部" : f === "send" ? "发送" : "接收"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <Switch checked={autoScroll} onCheckedChange={setAutoScroll} className="scale-75" />
                <Label className="text-[11px] text-muted-foreground">自动滚动</Label>
              </div>

              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportLogs}>
                <Download className="w-3 h-3" />
                导出
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive border-destructive/30"
                onClick={clearLogs}
              >
                <Trash2 className="w-3 h-3" />
                清空
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto rounded-lg bg-background border border-border p-2 space-y-0.5"
            style={{ minHeight: 300 }}
          >
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ScrollText className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">暂无通信记录</p>
                <p className="text-xs text-muted-foreground mt-1">
                  连接串口后，发送和接收的数据将显示在此处
                </p>
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <LogEntryRow
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedIds.has(entry.id)}
                  onToggle={() => toggleExpand(entry.id)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogEntryRow({
  entry,
  isExpanded,
  onToggle,
}: {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isSend = entry.direction === "send";
  const time = formatTime(entry.timestamp);

  return (
    <div
      className={cn(
        "rounded-md transition-colors",
        isExpanded ? "bg-accent/30" : "hover:bg-accent/20"
      )}
    >
      {/* Summary row */}
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
        )}

        {isSend ? (
          <ArrowUp className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        ) : (
          <ArrowDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        )}

        <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-24">{time}</span>

        <Badge
          variant="outline"
          className={cn(
            "text-[9px] px-1.5 py-0 shrink-0",
            isSend ? "border-cyan-500/40 text-cyan-400" : "border-emerald-500/40 text-emerald-400"
          )}
        >
          {isSend ? "TX" : "RX"}
        </Badge>

        <span className="text-xs text-foreground/80 truncate flex-1">
          {entry.parsed ? formatParsedFrame(entry.parsed) : entry.error || "无法解析"}
        </span>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 ml-5 space-y-2">
          <div className="p-2 rounded bg-background border border-border overflow-x-auto">
            <code className="hex-display text-primary/80 text-[11px] break-all">{entry.rawHex}</code>
          </div>

          {entry.parsed && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">方向: </span>
                <span>{entry.parsed.direction === DataDirection.Send ? "下发" : "上传"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">模式: </span>
                <span>{entry.parsed.workMode === WorkMode.Auto ? "自动" : "手动"}</span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-muted-foreground">活动气囊: </span>
                <span className="inline-flex flex-wrap gap-1 mt-1">
                  {entry.parsed.airbags
                    .filter((a) => a.gear !== GearLevel.Stop)
                    .slice(0, 10)
                    .map((a) => (
                      <Badge
                        key={a.id}
                        variant="outline"
                        className="text-[9px] px-1 py-0"
                        style={{
                          borderColor: GEAR_COLORS[a.gear],
                          color: GEAR_COLORS[a.gear],
                        }}
                      >
                        {a.id}:{GEAR_LABELS[a.gear]}
                      </Badge>
                    ))}
                  {entry.parsed.airbags.filter((a) => a.gear !== GearLevel.Stop).length === 0 && (
                    <span className="text-muted-foreground">无</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {entry.error && <div className="text-xs text-destructive">{entry.error}</div>}
        </div>
      )}
    </div>
  );
}
