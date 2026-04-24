/**
 * v2.0 左侧面板 — 连接状态、串口/USB配置、CAN总线、过滤设置
 * 浅色卡片式设计，参考原系统布局
 */
import { useState } from "react";
import { useCANContext } from "@/contexts/CANContext";
import { BAUD_RATE_OPTIONS, CAN_ID_BACKREST, formatMatrixSize } from "@/lib/canProtocol";
import type { SimulationMode } from "@/lib/canSimulator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import {
  Wifi,
  WifiOff,
  Plus,
  Play,
  Square,
  Settings,
  Filter,
  ChevronDown,
  Usb,
  Cable,
  Radio,
  Zap,
  Info,
  RefreshCw,
} from "lucide-react";

const ADC_PRESETS = [0, 5, 10, 20, 50];

const SIM_MODES: { value: SimulationMode; label: string }[] = [
  { value: "seated", label: "乘坐模拟" },
  { value: "wave", label: "波形扫描" },
  { value: "random", label: "随机数据" },
  { value: "gradient", label: "渐变测试" },
  { value: "static", label: "静态均值" },
];

export default function Sidebar() {
  const {
    transportMode,
    setTransportMode,
    isWebUSBAvailable,
    isSerialAvailable,
    connectionStatus,
    canBitrate,
    setCanBitrate,
    config,
    setConfig,
    usbDevices,
    selectedUSBDeviceIndex,
    setSelectedUSBDeviceIndex,
    scanUSBDevices,
    requestUSBDevice,
    ports,
    selectedPortIndex,
    setSelectedPortIndex,
    refreshPorts,
    requestNewPort,
    connect,
    disconnect,
    simulatorConfig,
    setSimulatorConfig,
    startSimulation,
    stopSimulation,
    adcThreshold,
    setAdcThreshold,
    error,
    frameRate,
    frameCount,
    backrestData,
    cushionData,
    activeDevice,
    backrestTrackedRegion,
    cushionTrackedRegion,
    hasDiscoveredSensors,
    resetTrackers,
  } = useCANContext();

  const [filterOpen, setFilterOpen] = useState(true);

  const currentData = activeDevice === CAN_ID_BACKREST ? backrestData : cushionData;
  const region = activeDevice === CAN_ID_BACKREST ? backrestTrackedRegion : cushionTrackedRegion;
  const isConnected = connectionStatus === "connected";
  const isSimulating = connectionStatus === "simulating";
  const isActive = isConnected || isSimulating;
  const isConnecting = connectionStatus === "connecting";

  return (
    <aside className="w-[250px] min-w-[250px] h-full border-r border-border bg-background flex flex-col overflow-y-auto">
      {/* 连接状态区域 */}
      <div className="px-3 py-3 border-b border-border">
        <div className="space-y-1.5 text-[12px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">连接状态</span>
            <span className={`flex items-center gap-1.5 font-medium ${
              isActive ? "text-success" : "text-destructive"
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                isActive ? "bg-green-500 status-pulse" : isConnecting ? "bg-yellow-500 status-pulse" : "bg-red-400"
              }`} />
              {isConnected ? "ONLINE" : isSimulating ? "DEMO" : isConnecting ? "CONNECTING" : "OFFLINE"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">设备</span>
            <span className="font-medium text-foreground">
              {isSimulating ? "模拟设备 (Demo)" : isConnected ? (transportMode === "webusb" ? "USB-CAN" : "串口") : "未连接"}
            </span>
          </div>
          {isActive && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">波特率</span>
                <span className="font-mono font-medium text-foreground">
                  {canBitrate.toLocaleString()} bps
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">帧率</span>
                <span className="font-mono font-semibold text-primary">
                  {frameRate} FPS
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">已接收帧</span>
                <span className="font-mono font-medium text-foreground">
                  {frameCount}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 串口/USB配置 */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Settings className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">串口配置</span>
        </div>

        <div className="bg-card rounded-lg border border-border p-3 space-y-3 shadow-sm">
          {/* 连接模式切换 */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">连接模式</label>
            <div className="flex rounded-md overflow-hidden border border-border">
              <button
                onClick={() => !isActive && setTransportMode("webusb")}
                disabled={isActive || !isWebUSBAvailable}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors border-r border-border ${
                  transportMode === "webusb"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent/50"
                } ${(!isWebUSBAvailable || isActive) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Usb className="w-3 h-3" />
                USB-CAN
              </button>
              <button
                onClick={() => !isActive && setTransportMode("serial")}
                disabled={isActive || !isSerialAvailable}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
                  transportMode === "serial"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent/50"
                } ${(!isSerialAvailable || isActive) ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Cable className="w-3 h-3" />
                串口
              </button>
            </div>
          </div>

          {/* 波特率 */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" />
              波特率 (bps)
            </label>
            <Select
              value={String(transportMode === "serial" ? config.baudRate : canBitrate)}
              onValueChange={(v) => {
                if (transportMode === "serial") {
                  setConfig({ ...config, baudRate: Number(v) });
                } else {
                  setCanBitrate(Number(v));
                }
              }}
              disabled={isActive}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATE_OPTIONS.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 矩阵规格 */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground flex items-center gap-1">
              矩阵规格
            </label>
            <div className="h-8 flex items-center px-3 text-xs bg-background rounded-md border border-border text-foreground">
              {isActive ? formatMatrixSize(region) : "10 x 10"}
            </div>
          </div>

          {/* 数据格式 */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">
              {transportMode === "webusb" ? "协议 / 帧格式" : "数据位 / 停止位 / 校验"}
            </label>
            <div className="h-8 flex items-center px-3 text-xs bg-background rounded-md border border-border text-foreground font-mono">
              {transportMode === "webusb" ? "gs_usb / 标准帧 11-bit" : "8 / 1 / None"}
            </div>
          </div>

          {/* 设备列表 */}
          {transportMode === "webusb" ? (
            usbDevices.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">设备列表</label>
                <div className="space-y-1">
                  {usbDevices.map((d, i) => (
                    <div
                      key={`usb-${i}`}
                      onClick={() => setSelectedUSBDeviceIndex(i)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] cursor-pointer transition-colors ${
                        selectedUSBDeviceIndex === i
                          ? "bg-primary/10 border border-primary/30 text-primary"
                          : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <Usb className="w-3 h-3 shrink-0" />
                      <span className="truncate">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            ports.length > 0 && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">设备列表</label>
                <div className="space-y-1">
                  {ports.map((p) => (
                    <div
                      key={p.index}
                      onClick={() => setSelectedPortIndex(p.index)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] cursor-pointer transition-colors ${
                        selectedPortIndex === p.index
                          ? "bg-primary/10 border border-primary/30 text-primary"
                          : "hover:bg-accent border border-transparent"
                      }`}
                    >
                      <Cable className="w-3 h-3 shrink-0" />
                      <span className="truncate">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

        {/* 操作按钮 */}
        <div className="mt-3 space-y-2">
          {/* 连接/断开 */}
          <Button
            variant={isConnected ? "outline" : "default"}
            size="sm"
            className={`w-full h-9 text-xs gap-1.5 ${isConnected ? "border-destructive text-destructive hover:bg-destructive/5" : ""}`}
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting || isSimulating}
          >
            {isConnected ? (
              <>
                <Square className="w-3.5 h-3.5" />
                断开连接
              </>
            ) : isConnecting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                连接中...
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                {transportMode === "webusb" ? "连接USB-CAN" : "连接串口"}
              </>
            )}
          </Button>

          {/* 设备操作 */}
          <div className="flex gap-1.5">
            {transportMode === "webusb" ? (
              <>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1" onClick={scanUSBDevices} disabled={isActive}>
                  <RefreshCw className="w-3 h-3" />
                  扫描
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1" onClick={requestUSBDevice} disabled={isActive}>
                  <Plus className="w-3 h-3" />
                  添加
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1" onClick={requestNewPort} disabled={isActive}>
                  <Plus className="w-3 h-3" />
                  添加串口
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] gap-1" onClick={refreshPorts} disabled={isActive}>
                  <RefreshCw className="w-3 h-3" />
                  刷新
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* CAN总线 */}
      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-1.5 mb-2">
          <Radio className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">CAN 总线</span>
          <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary">
            {isActive ? "在线" : "预留"}
          </span>
        </div>
        <div className="bg-card rounded-lg border border-border p-2.5 shadow-sm">
          <div className="text-[11px] text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>靠背 CAN ID</span>
              <span className="font-mono text-primary">0x460</span>
            </div>
            <div className="flex justify-between">
              <span>坐垫 CAN ID</span>
              <span className="font-mono text-primary">0x461</span>
            </div>
            <div className="flex justify-between">
              <span>传感器数量</span>
              <span className="font-mono text-foreground">{isActive ? `${region.rows * region.cols}点` : "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>帧间隔</span>
              <span className="font-mono text-foreground">72ms</span>
            </div>
          </div>
        </div>

        {/* 模拟数据 */}
        <Button
          variant="outline"
          size="sm"
          className={`w-full h-8 text-xs gap-1.5 mt-2 ${isSimulating ? "border-destructive text-destructive" : ""}`}
          onClick={isSimulating ? stopSimulation : startSimulation}
          disabled={isConnected}
        >
          {isSimulating ? (
            <>
              <Square className="w-3.5 h-3.5" />
              停止模拟
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              模拟数据演示
            </>
          )}
        </Button>

        {isSimulating && (
          <Select
            value={simulatorConfig.mode}
            onValueChange={(v) => setSimulatorConfig({ mode: v as SimulationMode })}
          >
            <SelectTrigger className="h-7 text-[11px] mt-1.5 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIM_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 过滤设置 */}
      <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">过滤设置</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${filterOpen ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 py-3 border-b border-border space-y-2.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                <Filter className="w-3 h-3" />
                ADC过滤阈值
              </label>
              <a className="text-[10px] text-primary ml-auto cursor-pointer hover:underline">说明</a>
            </div>

            {/* 滑块 */}
            <Slider
              value={[adcThreshold]}
              onValueChange={([v]) => setAdcThreshold(v)}
              min={0}
              max={255}
              step={1}
              className="w-full"
            />

            {/* 数值输入 */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={adcThreshold}
                onChange={(e) => setAdcThreshold(Math.max(0, Math.min(255, Number(e.target.value))))}
                className="w-16 h-7 text-xs text-center bg-card border border-border rounded px-1 font-mono"
                min={0}
                max={255}
              />
              <span className="text-[11px] text-muted-foreground">/ 255</span>
            </div>

            {/* 预设按钮 */}
            <div className="flex gap-1">
              {ADC_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setAdcThreshold(v)}
                  className={`flex-1 h-6 text-[11px] rounded border transition-colors ${
                    adcThreshold === v
                      ? "bg-primary/15 border-primary/40 text-primary font-medium"
                      : "bg-card border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 错误提示 */}
      {error && (
        <div className="px-3 py-2 border-b border-border">
          <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5 border border-destructive/20">
            {error}
          </div>
        </div>
      )}

      {/* 底部 */}
      <div className="mt-auto px-3 py-2">
        <div className="text-[10px] text-muted-foreground/50 text-center">
          矩侨工业 CAN传感器上位机 v2.0
        </div>
      </div>
    </aside>
  );
}
