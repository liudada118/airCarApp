/**
 * Design: Automotive HMI Dark Console
 * 左侧边栏 — 设备管理、串口配置、过滤设置、自动化验收
 */
import { useState } from "react";
import { useCANContext } from "@/contexts/CANContext";
import {
  BAUD_RATE_OPTIONS,
} from "@/lib/canProtocol";
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
  Radio,
  MonitorSmartphone,
  Zap,
  ClipboardCheck,
  Info,
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
    connectionStatus,
    config,
    setConfig,
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
  } = useCANContext();

  const [deviceOpen, setDeviceOpen] = useState(true);
  const [serialOpen, setSerialOpen] = useState(true);
  const [filterOpen, setFilterOpen] = useState(true);
  const [acceptOpen, setAcceptOpen] = useState(false);

  const isConnected = connectionStatus === "connected";
  const isSimulating = connectionStatus === "simulating";
  const isActive = isConnected || isSimulating;
  const isConnecting = connectionStatus === "connecting";

  return (
    <aside className="w-[260px] min-w-[260px] h-full border-r border-border/50 bg-sidebar flex flex-col overflow-hidden">
      {/* 设备管理 */}
      <Collapsible open={deviceOpen} onOpenChange={setDeviceOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wide">设备管理</span>
            <span className="text-[10px] text-muted-foreground font-mono tracking-widest">CAN-BUS</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${deviceOpen ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {/* 设备列表 */}
            <div className="bg-card/50 rounded-md border border-border/30 p-2">
              {ports.length === 0 && !isSimulating ? (
                <div className="text-center py-3">
                  <Usb className="w-6 h-6 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[11px] text-muted-foreground">暂无设备</p>
                  <p className="text-[10px] text-muted-foreground/60">点击下方按钮添加设备</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {ports.map((p) => (
                    <div
                      key={p.index}
                      onClick={() => setSelectedPortIndex(p.index)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                        selectedPortIndex === p.index
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-accent/50 border border-transparent"
                      }`}
                    >
                      <Usb className="w-3 h-3 text-muted-foreground" />
                      <span className="truncate">{p.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 添加设备按钮 */}
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-[11px] gap-1"
                onClick={requestNewPort}
                disabled={isActive}
              >
                <Plus className="w-3 h-3" />
                添加串口
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-[11px] gap-1"
                onClick={isSimulating ? stopSimulation : startSimulation}
              >
                {isSimulating ? (
                  <>
                    <Square className="w-3 h-3" />
                    停止模拟
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    模拟设备
                  </>
                )}
              </Button>
            </div>

            {/* 通信状态 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Radio className="w-3 h-3" />
                  通信状态
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] px-1">
                <span className="text-muted-foreground">连接状态</span>
                <span className={`flex items-center gap-1.5 font-medium ${
                  isActive ? "text-emerald-400" : "text-destructive"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isActive ? "bg-emerald-400 animate-pulse" : "bg-destructive"
                  }`} />
                  {isConnected ? "ONLINE" : isSimulating ? "SIMULATING" : isConnecting ? "CONNECTING..." : "OFFLINE"}
                </span>
              </div>
              {isActive && (
                <div className="flex items-center justify-between text-[11px] px-1">
                  <span className="text-muted-foreground">帧率</span>
                  <span className="text-chart-1 font-mono">{frameRate} fps</span>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/30" />

      {/* 串口配置 */}
      <Collapsible open={serialOpen} onOpenChange={setSerialOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wide">串口配置</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${serialOpen ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            {/* 波特率 */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3" />
                波特率 (bps)
              </label>
              <Select
                value={String(config.baudRate)}
                onValueChange={(v) => setConfig({ ...config, baudRate: Number(v) })}
                disabled={isActive}
              >
                <SelectTrigger className="h-7 text-xs">
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

            {/* 数据格式 */}
            <div className="text-[11px] text-muted-foreground space-y-0.5 bg-card/30 rounded px-2 py-1.5">
              <div className="flex justify-between">
                <span>数据位 / 停止位 / 校验</span>
                <span className="font-mono text-foreground/80">8 / 1 / None</span>
              </div>
            </div>

            {/* 连接按钮 */}
            <div className="flex gap-1.5">
              <Button
                variant={isConnected ? "destructive" : "default"}
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                onClick={isConnected ? disconnect : connect}
                disabled={isConnecting || isSimulating}
              >
                {isConnected ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    断开连接
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    连接CAN设备
                  </>
                )}
              </Button>
            </div>

            {/* 模拟数据按钮 */}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={isSimulating ? stopSimulation : startSimulation}
              disabled={isConnected}
            >
              <Play className="w-3.5 h-3.5" />
              {isSimulating ? "停止模拟" : "模拟数据演示"}
            </Button>

            {/* 模拟模式选择 */}
            {isSimulating && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">模拟模式</label>
                <Select
                  value={simulatorConfig.mode}
                  onValueChange={(v) => setSimulatorConfig({ mode: v as SimulationMode })}
                >
                  <SelectTrigger className="h-7 text-xs">
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
              </div>
            )}

            {/* 错误提示 */}
            {error && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5 border border-destructive/20">
                {error}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/30" />

      {/* 说明 */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wide">说明</span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
            <p>本系统通过CAN总线协议接收汽车座椅压力传感器数据。</p>
            <div className="bg-card/30 rounded px-2 py-1.5 font-mono text-[10px] space-y-0.5">
              <div>靠背 CAN ID: <span className="text-chart-1">0x460</span></div>
              <div>坐垫 CAN ID: <span className="text-chart-1">0x461</span></div>
              <div>传感器数量: <span className="text-chart-1">100点</span></div>
              <div>矩阵布局: <span className="text-chart-1">10x10</span></div>
              <div>压力范围: <span className="text-chart-1">0-255</span></div>
              <div>帧间隔: <span className="text-chart-1">72ms</span></div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/30" />

      {/* 过滤设置 */}
      <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wide">过滤设置</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${filterOpen ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-muted-foreground whitespace-nowrap">ADC过滤值</label>
              <input
                type="number"
                value={adcThreshold}
                onChange={(e) => setAdcThreshold(Math.max(0, Math.min(255, Number(e.target.value))))}
                className="w-14 h-6 text-xs text-center bg-input border border-border rounded px-1 font-mono"
                min={0}
                max={255}
              />
            </div>
            <div className="flex gap-1">
              {ADC_PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setAdcThreshold(v)}
                  className={`flex-1 h-6 text-[11px] rounded border transition-colors ${
                    adcThreshold === v
                      ? "bg-primary/20 border-primary/40 text-primary"
                      : "bg-card/30 border-border/30 text-muted-foreground hover:border-border"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="h-px bg-border/30" />

      {/* 自动化验收 */}
      <Collapsible open={acceptOpen} onOpenChange={setAcceptOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold tracking-wide">自动化验收</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${acceptOpen ? "" : "-rotate-90"}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-2">
            <div className="text-[11px] text-muted-foreground bg-card/30 rounded px-2 py-2 space-y-1">
              <p className="font-medium text-foreground/80">验收测试流程：</p>
              <p>1. 点击"开始验收"进入监测模式</p>
              <p>2. 用指定压力按压每个传感器点</p>
              <p>3. 系统自动记录响应值并判定合格</p>
              <p>4. 生成验收报告</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              disabled={!isActive}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              开始验收测试
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* 底部 */}
      <div className="mt-auto border-t border-border/30 px-3 py-2">
        <div className="text-[10px] text-muted-foreground/50 text-center">
          矩侨工业 CAN传感器上位机 v1.0
        </div>
      </div>
    </aside>
  );
}
