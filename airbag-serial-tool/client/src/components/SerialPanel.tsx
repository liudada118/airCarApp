/**
 * Design: Top bar with serial connection controls
 * Shows port selector dropdown, baud rate, connect/disconnect buttons
 * Supports detecting and listing available serial ports
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plug, Unplug, AlertCircle, WifiOff, RefreshCw, PlusCircle, Usb } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SerialPanel() {
  const {
    isConnected,
    isConnecting,
    config,
    setConfig,
    connect,
    disconnect,
    error,
    ports,
    selectedPortIndex,
    setSelectedPortIndex,
    refreshPorts,
    requestNewPort,
  } = useSerialContext();

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card/50 backdrop-blur-sm flex items-center gap-2.5 px-4 lg:px-6">
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

      {/* Port selector */}
      <div className="flex items-center gap-1.5">
        <Usb className="w-3.5 h-3.5 text-muted-foreground hidden md:block" />
        <Select
          value={selectedPortIndex >= 0 ? String(selectedPortIndex) : "none"}
          onValueChange={(v) => {
            if (v !== "none") setSelectedPortIndex(Number(v));
          }}
          disabled={isConnected}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs bg-input border-border">
            <SelectValue placeholder="选择串口设备" />
          </SelectTrigger>
          <SelectContent>
            {ports.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground mb-2">未检测到已授权的串口</p>
                <p className="text-[11px] text-muted-foreground">请点击 "+" 按钮添加串口设备</p>
              </div>
            ) : (
              ports.map((p) => (
                <SelectItem key={p.index} value={String(p.index)}>
                  <span className="flex items-center gap-1.5">
                    <Usb className="w-3 h-3 text-muted-foreground shrink-0" />
                    {p.label}
                  </span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* Refresh ports button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={refreshPorts}
              disabled={isConnected}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">刷新串口列表</p>
          </TooltipContent>
        </Tooltip>

        {/* Add new port button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
              onClick={requestNewPort}
              disabled={isConnected}
            >
              <PlusCircle className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">添加新串口设备</p>
          </TooltipContent>
        </Tooltip>
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
