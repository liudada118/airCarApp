/**
 * 连接控制面板
 * 设计风格: 深空控制台 - 工业监控面板
 */
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionStatus, MatrixSize, SerialConfig } from "@/lib/serial-service";
import { SerialService } from "@/lib/serial-service";
import {
  Activity,
  MonitorDot,
  Play,
  PlugZap,
  Square,
  Usb,

} from "lucide-react";
import { toast } from "sonner";

interface ConnectionPanelProps {
  config: SerialConfig;
  status: ConnectionStatus;
  isConnected: boolean;
  isDemo: boolean;
  serialSupported: boolean;
  onConnect: () => Promise<void>;
  onConnectDemo: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onConfigChange: (config: Partial<SerialConfig>) => void;
}

const BAUD_RATES = [
  { value: "9600", label: "9600" },
  { value: "19200", label: "19200" },
  { value: "38400", label: "38400" },
  { value: "57600", label: "57600" },
  { value: "115200", label: "115200" },
  { value: "230400", label: "230400" },
  { value: "460800", label: "460800" },
  { value: "921600", label: "921600" },
  { value: "1000000", label: "1000000" },
  { value: "2000000", label: "2000000" },
];

const MATRIX_SIZES: { value: MatrixSize; label: string }[] = [
  { value: "5x5", label: "5 x 5 (921600)" },
  { value: "10x10", label: "10 x 10" },
  { value: "16x16", label: "16 x 16" },
  { value: "32x32", label: "32 x 32" },
];

export default function ConnectionPanel({
  config,
  status,
  isConnected,
  isDemo,
  serialSupported,
  onConnect,
  onConnectDemo,
  onDisconnect,
  onConfigChange,
}: ConnectionPanelProps) {
  const handleConnect = async () => {
    try {
      await onConnect();
      toast.success("串口连接成功");
    } catch (err) {
      toast.error(`连接失败: ${err instanceof Error ? err.message : "未知错误"}`);
    }
  };

  const handleDemo = async () => {
    try {
      await onConnectDemo();
      toast.success("已启动模拟数据模式");
    } catch (err) {
      toast.error("启动模拟模式失败");
    }
  };

  const handleDisconnect = async () => {
    await onDisconnect();
    toast.info("已断开连接");
  };

  return (
    <div className="space-y-4">
      {/* Connection Status Indicator */}


      {/* Serial Port Config */}
      <div className="industrial-panel rounded-md overflow-hidden">
        <div className="industrial-panel-header flex items-center gap-2">
          <Usb className="w-3 h-3" />
          <span>串口配置</span>
        </div>
        <div className="p-3 space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              波特率 (bps)
            </label>
            <Select
              value={String(config.baudRate)}
              onValueChange={(v) => onConfigChange({ baudRate: Number(v) })}
              disabled={isConnected}
            >
              <SelectTrigger className="h-8 text-xs font-mono bg-background/50 border-industrial-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((rate) => (
                  <SelectItem key={rate.value} value={rate.value} className="text-xs font-mono">
                    {rate.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MonitorDot className="w-3 h-3" />
              矩阵规格
            </label>
            <Select
              value={config.matrixSize}
              onValueChange={(v) => {
                const newSize = v as MatrixSize;
                // 选择5×5时自动联动波特率为921600
                if (newSize === "5x5") {
                  onConfigChange({ matrixSize: newSize, baudRate: 921600 });
                } else if (config.baudRate === 921600) {
                  // 从5×5切换到其他规格时恢复默认波特率
                  onConfigChange({ matrixSize: newSize, baudRate: 1000000 });
                } else {
                  onConfigChange({ matrixSize: newSize });
                }
              }}
              disabled={isConnected}
            >
              <SelectTrigger className="h-8 text-xs font-mono bg-background/50 border-industrial-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATRIX_SIZES.map((size) => (
                  <SelectItem key={size.value} value={size.value} className="text-xs font-mono">
                    {size.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>
      </div>

      {/* Connection Buttons */}
      <div className="space-y-2">
        {!isConnected ? (
          <>
            <Button
              onClick={handleConnect}
              disabled={!serialSupported}
              className="w-full h-9 text-xs font-mono uppercase tracking-wider bg-jq-blue hover:bg-jq-blue-bright text-white"
            >
              <PlugZap className="w-3.5 h-3.5 mr-2" />
              连接串口设备
            </Button>
            <Button
              onClick={handleDemo}
              variant="outline"
              className="w-full h-9 text-xs font-mono uppercase tracking-wider border-industrial-border hover:bg-accent"
            >
              <Play className="w-3.5 h-3.5 mr-2" />
              模拟数据演示
            </Button>
            {!serialSupported && (
              <p className="text-[10px] text-warning-orange text-center">
                当前浏览器不支持 Web Serial API，请使用 Chrome / Edge
              </p>
            )}
          </>
        ) : (
          <Button
            onClick={handleDisconnect}
            variant="outline"
            className="w-full h-9 text-xs font-mono uppercase tracking-wider border-danger-red text-danger-red hover:bg-danger-red/10"
          >
            <Square className="w-3.5 h-3.5 mr-2" />
            断开连接
          </Button>
        )}
      </div>


    </div>
  );
}
