/**
 * Design: Top bar with serial connection controls
 * Shows connection status, baud rate selector, connect/disconnect buttons
 */
import { useSerialContext } from "@/contexts/SerialContext";
import { BAUD_RATE_OPTIONS } from "@/lib/protocol";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plug, Unplug, AlertCircle, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SerialPanel() {
  const { isConnected, isConnecting, config, setConfig, connect, disconnect, error } =
    useSerialContext();

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/50 backdrop-blur-sm flex items-center gap-3 px-4 lg:px-6">
      {/* Connection status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full transition-colors",
            isConnected
              ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
              : "bg-slate-500"
          )}
        />
        <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
          {isConnected ? "已连接" : "未连接"}
        </span>
      </div>

      <div className="w-px h-6 bg-border" />

      {/* Baud rate selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden md:inline">波特率</span>
        <Select
          value={String(config.baudRate)}
          onValueChange={(v) => setConfig({ ...config, baudRate: Number(v) })}
          disabled={isConnected}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs bg-input border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BAUD_RATE_OPTIONS.map((rate) => (
              <SelectItem key={rate} value={String(rate)}>
                {rate.toLocaleString()} bps
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Serial config display */}
      <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
        <span>{config.dataBits}位数据</span>
        <span className="text-border">|</span>
        <span>{config.stopBits}位停止</span>
        <span className="text-border">|</span>
        <span>无校验</span>
      </div>

      <div className="flex-1" />

      {/* Error display */}
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive max-w-xs truncate">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Connect/Disconnect button */}
      {isConnected ? (
        <Button
          variant="outline"
          size="sm"
          onClick={disconnect}
          className="gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Unplug className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">断开连接</span>
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={connect}
          disabled={isConnecting}
          className="gap-1.5 text-xs bg-primary hover:bg-primary/90"
        >
          {isConnecting ? (
            <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          ) : (
            <Plug className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">
            {isConnecting ? "连接中..." : "连接串口"}
          </span>
        </Button>
      )}
    </header>
  );
}
