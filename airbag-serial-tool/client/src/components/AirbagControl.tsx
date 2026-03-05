/**
 * Design: Dark Tech Dashboard — Seat airbag visualization with interactive zones
 * Left: Seat diagram with clickable airbag zones (SVG overlay aligned to image)
 * Right: Control panel for selected airbag + quick actions + hex preview
 */
import { useState, useMemo, useCallback } from "react";
import { useSerialContext } from "@/contexts/SerialContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  GearLevel,
  WorkMode,
  DataDirection,
  GEAR_LABELS,
  GEAR_COLORS,
  AIRBAG_LAYOUT,
  encodeFrame,
  bytesToHex,
  createDefaultFrame,
  type FrameData,
} from "@/lib/protocol";
import { cn } from "@/lib/utils";
import { Send, Save, RotateCcw, Zap } from "lucide-react";

const SEAT_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663390129888/Q9sJLLGbMLYzkLTt6EE66b/seat-diagram-cku5rB2r5MCmzkjcBahZYF.webp";

/**
 * SVG overlay positions calibrated to the seat-diagram image.
 * The image is 1792×2400 (aspect 0.747). The viewBox uses 100×134 to match.
 * Coordinates are tuned so each clickable rectangle sits on top of the
 * corresponding numbered zone in the generated seat image.
 */
const ZONE_RECTS: Record<number, { x: number; y: number; w: number; h: number }> = {
  1:  { x: 27, y: 19, w: 20, h: 12 },
  2:  { x: 53, y: 19, w: 20, h: 12 },
  3:  { x: 18, y: 48, w: 14, h: 22 },
  4:  { x: 68, y: 48, w: 14, h: 22 },
  5:  { x: 35, y: 48, w: 30, h: 10 },
  6:  { x: 35, y: 60, w: 30, h: 10 },
  7:  { x: 30, y: 82, w: 18, h: 12 },
  8:  { x: 52, y: 82, w: 18, h: 12 },
  9:  { x: 25, y: 97, w: 22, h: 12 },
  10: { x: 53, y: 97, w: 22, h: 12 },
};

export default function AirbagControl() {
  const { isConnected, send, addCommand, lastReceived } = useSerialContext();
  const [frame, setFrame] = useState<FrameData>(createDefaultFrame);
  const [selectedAirbag, setSelectedAirbag] = useState<number | null>(null);
  const [commandName, setCommandName] = useState("");

  const visibleAirbags = useMemo(
    () => AIRBAG_LAYOUT.filter((a) => a.id <= 10),
    []
  );

  const updateAirbagGear = useCallback((id: number, gear: GearLevel) => {
    setFrame((prev) => ({
      ...prev,
      airbags: prev.airbags.map((a) => (a.id === id ? { ...a, gear } : a)),
    }));
  }, []);

  const setAllGear = useCallback((gear: GearLevel) => {
    setFrame((prev) => ({
      ...prev,
      airbags: prev.airbags.map((a) => ({ ...a, gear })),
    }));
  }, []);

  const handleSend = useCallback(async () => {
    const sendFrame = { ...frame, direction: DataDirection.Send };
    const encoded = encodeFrame(sendFrame);
    await send(encoded);
    toast.success("指令已发送");
  }, [frame, send]);

  const handleSave = useCallback(() => {
    const sendFrame = { ...frame, direction: DataDirection.Send };
    const encoded = encodeFrame(sendFrame);
    const name = commandName.trim() || `指令_${new Date().toLocaleTimeString()}`;
    addCommand({ name, frame: sendFrame, rawHex: bytesToHex(encoded) });
    setCommandName("");
    toast.success(`指令 "${name}" 已保存`);
  }, [frame, commandName, addCommand]);

  const handleReset = useCallback(() => {
    setFrame(createDefaultFrame());
    setSelectedAirbag(null);
    toast.info("已重置为全部保压");
  }, []);

  const getAirbagGear = (id: number): GearLevel =>
    frame.airbags.find((a) => a.id === id)?.gear ?? GearLevel.Stop;

  const getReceivedGear = (id: number): GearLevel | null => {
    if (!lastReceived) return null;
    return lastReceived.airbags.find((a) => a.id === id)?.gear ?? null;
  };

  const hexPreview = useMemo(() => {
    const sendFrame = { ...frame, direction: DataDirection.Send };
    return bytesToHex(encodeFrame(sendFrame));
  }, [frame]);

  return (
    <div className="flex flex-col xl:flex-row gap-4 lg:gap-6 h-full">
      {/* ── Left: Seat Visualization ─────────────────────────── */}
      <div className="xl:w-[480px] shrink-0">
        <Card className="bg-card border-border h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-[Space_Grotesk] font-semibold">
                座椅气囊分布
              </CardTitle>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">模式</Label>
                <Select
                  value={String(frame.workMode)}
                  onValueChange={(v) =>
                    setFrame((prev) => ({ ...prev, workMode: Number(v) as WorkMode }))
                  }
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">自动</SelectItem>
                    <SelectItem value="1">手动</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {/* Seat image + SVG overlay */}
            <div className="relative mx-auto" style={{ maxWidth: 380 }}>
              <img
                src={SEAT_IMG}
                alt="座椅气囊分布图"
                className="w-full h-auto opacity-50 select-none pointer-events-none"
                draggable={false}
              />

              {/* Interactive SVG overlay – viewBox matches image aspect ratio */}
              <svg
                viewBox="0 0 100 134"
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="xMidYMid meet"
              >
                {Object.entries(ZONE_RECTS).map(([idStr, rect]) => {
                  const id = Number(idStr);
                  const gear = getAirbagGear(id);
                  const recvGear = getReceivedGear(id);
                  const isSelected = selectedAirbag === id;
                  const isActive = gear !== GearLevel.Stop;
                  const color = GEAR_COLORS[gear];

                  return (
                    <g
                      key={id}
                      onClick={() => setSelectedAirbag(id)}
                      className="cursor-pointer"
                    >
                      {/* Glow background when active */}
                      {isActive && (
                        <rect
                          x={rect.x - 1}
                          y={rect.y - 1}
                          width={rect.w + 2}
                          height={rect.h + 2}
                          rx={3}
                          fill={color}
                          fillOpacity={0.15}
                          className="airbag-active"
                        />
                      )}

                      {/* Main zone rect */}
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.w}
                        height={rect.h}
                        rx={2.5}
                        fill={isActive ? color : "rgba(100,116,139,0.08)"}
                        fillOpacity={isActive ? 0.4 : 1}
                        stroke={isSelected ? "#ffffff" : isActive ? color : "rgba(148,163,184,0.25)"}
                        strokeWidth={isSelected ? 1 : 0.5}
                        className="transition-all duration-300"
                      />

                      {/* Received status indicator dot (top-right) */}
                      {recvGear !== null && recvGear !== GearLevel.Stop && (
                        <circle
                          cx={rect.x + rect.w - 2.5}
                          cy={rect.y + 2.5}
                          r={1.8}
                          fill={GEAR_COLORS[recvGear]}
                          stroke="#0B1120"
                          strokeWidth={0.4}
                          className="animate-pulse"
                        />
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {Object.entries(GEAR_LABELS).map(([key, label]) => {
                const gear = Number(key) as GearLevel;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: GEAR_COLORS[gear] }}
                    />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Right: Control Panel ─────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Selected airbag control */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-[Space_Grotesk] font-semibold">
              {selectedAirbag
                ? `气囊 ${selectedAirbag} — ${AIRBAG_LAYOUT.find((a) => a.id === selectedAirbag)?.name}`
                : "点击座椅图选择气囊"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {selectedAirbag ? (
              <div className="space-y-4">
                {/* Gear buttons */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(GEAR_LABELS).map(([key, label]) => {
                    const gear = Number(key) as GearLevel;
                    const isActive = getAirbagGear(selectedAirbag) === gear;
                    return (
                      <Button
                        key={key}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateAirbagGear(selectedAirbag, gear)}
                        className={cn("text-xs min-w-[72px]", isActive && "shadow-[0_0_12px_-2px]")}
                        style={
                          isActive
                            ? {
                                backgroundColor: GEAR_COLORS[gear],
                                boxShadow: `0 0 12px -2px ${GEAR_COLORS[gear]}`,
                                color: gear === GearLevel.Gear3 ? "#000" : "#fff",
                              }
                            : {}
                        }
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>

                {/* Received status */}
                {lastReceived && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-accent/50 border border-border">
                    <span className="text-xs text-muted-foreground">从机反馈:</span>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: GEAR_COLORS[getReceivedGear(selectedAirbag) ?? GearLevel.Stop],
                        color: GEAR_COLORS[getReceivedGear(selectedAirbag) ?? GearLevel.Stop],
                      }}
                    >
                      {GEAR_LABELS[getReceivedGear(selectedAirbag) ?? GearLevel.Stop]}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {lastReceived.workMode === WorkMode.Auto ? "自动模式" : "手动模式"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                请在左侧座椅图上点击气囊区域进行选择，然后设置档位
              </p>
            )}
          </CardContent>
        </Card>

        {/* All airbags quick overview */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-[Space_Grotesk] font-semibold">
                全部气囊状态
              </CardTitle>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleReset}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  全部保压
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setAllGear(GearLevel.Gear1)}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  全部1档
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-5 gap-2">
              {visibleAirbags.map((ab) => {
                const gear = getAirbagGear(ab.id);
                const isActive = gear !== GearLevel.Stop;
                return (
                  <button
                    key={ab.id}
                    onClick={() => setSelectedAirbag(ab.id)}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all duration-200",
                      selectedAirbag === ab.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-accent/30 hover:bg-accent/60"
                    )}
                  >
                    <div
                      className="text-xs font-[Space_Grotesk] font-semibold"
                      style={{ color: isActive ? GEAR_COLORS[gear] : undefined }}
                    >
                      {ab.id}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {GEAR_LABELS[gear]}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Hex preview + actions */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-[Space_Grotesk] font-semibold">
              指令预览
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="p-3 rounded-lg bg-background border border-border overflow-x-auto">
              <code className="hex-display text-primary/90 break-all leading-relaxed">
                {hexPreview}
              </code>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={commandName}
                onChange={(e) => setCommandName(e.target.value)}
                placeholder="指令名称（可选）"
                className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleSave} className="gap-1.5 text-xs">
                  <Save className="w-3.5 h-3.5" />
                  保存指令
                </Button>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!isConnected}
                  className="gap-1.5 text-xs bg-primary hover:bg-primary/90"
                >
                  <Send className="w-3.5 h-3.5" />
                  发送
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
