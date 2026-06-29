/**
 * 多设备管理面板
 * 支持同时连接多个串口设备进行并行测试
 */
import {
  type DeviceInfo,
  getDeviceStatusColor,
  getDeviceStatusLabel,
} from "@/lib/multi-device";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Layers,
  Plus,
  Trash2,
  MonitorSmartphone,
  Unplug,
  Link2,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

interface MultiDevicePanelProps {
  devices: DeviceInfo[];
  activeDeviceId: string | null;
  onAddDevice: () => void;
  onRemoveDevice: (id: string) => void;
  onConnectDevice: (id: string) => void;
  onDisconnectDevice: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onConnectDemoDevice: () => void;
  serialSupported: boolean;
}

export default function MultiDevicePanel({
  devices,
  activeDeviceId,
  onAddDevice,
  onRemoveDevice,
  onConnectDevice,
  onDisconnectDevice,
  onSelectDevice,
  onConnectDemoDevice,
  serialSupported,
}: MultiDevicePanelProps) {
  const [expanded, setExpanded] = useState(false);

  const connectedCount = devices.filter((d) => d.status === "connected").length;

  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="industrial-panel-header flex items-center gap-2 w-full cursor-pointer hover:bg-muted/20 transition-colors"
      >
        <Layers className="w-3 h-3" />
        <span>设备管理</span>
        <span className="text-[8px] text-muted-foreground/50">Multi-Device</span>
        {connectedCount > 0 && (
          <span className="ml-1 text-[8px] font-mono bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded">
            {connectedCount} 在线
          </span>
        )}
        <div className="flex-1" />
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {/* Device List */}
          {devices.length === 0 ? (
            <div className="text-center py-3">
              <MonitorSmartphone className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-[10px] text-muted-foreground/50">暂无设备</p>
              <p className="text-[9px] text-muted-foreground/30">点击下方按钮添加设备</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {devices.map((device) => {
                const isActive = device.id === activeDeviceId;
                const statusColor = getDeviceStatusColor(device.status);

                return (
                  <div
                    key={device.id}
                    className={`rounded border px-2.5 py-2 transition-all cursor-pointer ${
                      isActive
                        ? "border-jq-blue/50 bg-jq-blue/5"
                        : "border-border/50 bg-background/30 hover:border-border"
                    }`}
                    onClick={() => onSelectDevice(device.id)}
                  >
                    <div className="flex items-center gap-2">
                      {/* Status dot */}
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: statusColor }}
                      />

                      {/* Device info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium truncate">
                            {device.name}
                          </span>
                          {device.isDemo && (
                            <span className="text-[7px] font-mono bg-amber-500/15 text-amber-400 px-1 rounded">
                              DEMO
                            </span>
                          )}
                          {isActive && (
                            <Eye className="w-2.5 h-2.5 text-jq-blue shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[8px] text-muted-foreground/60 font-mono mt-0.5">
                          <span>{device.matrixSize}</span>
                          <span>{device.baudRate.toLocaleString()} bps</span>
                          {device.status === "connected" && (
                            <span className="text-green-400/70">{device.fps} FPS</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {device.status === "connected" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDisconnectDevice(device.id);
                            }}
                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="断开连接"
                          >
                            <Unplug className="w-3 h-3" />
                          </button>
                        ) : device.status === "disconnected" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onConnectDevice(device.id);
                            }}
                            className="p-1 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                            title="连接设备"
                          >
                            <Link2 className="w-3 h-3" />
                          </button>
                        ) : null}
                        {device.status === "disconnected" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveDevice(device.id);
                            }}
                            className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                            title="移除设备"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Device Buttons */}
          <div className="flex gap-1.5 pt-1">
            <Button
              onClick={onAddDevice}
              disabled={!serialSupported}
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[9px] font-mono border-border/50 hover:border-jq-blue/50"
            >
              <Plus className="w-3 h-3 mr-1" />
              添加串口
            </Button>
            <Button
              onClick={onConnectDemoDevice}
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[9px] font-mono border-border/50 hover:border-amber-500/50"
            >
              <Plus className="w-3 h-3 mr-1" />
              模拟设备
            </Button>
          </div>

          {!serialSupported && (
            <p className="text-[8px] text-amber-400/60 text-center">
              当前浏览器不支持Web Serial API，请使用Chrome/Edge
            </p>
          )}
        </div>
      )}
    </div>
  );
}
