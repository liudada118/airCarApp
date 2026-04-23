/**
 * Design: Automotive HMI Dark Console
 * 顶部Header — 品牌标识、系统标题、状态指示
 */
import { useCANContext } from "@/contexts/CANContext";

import { Cpu, Signal, Clock } from "lucide-react";
import { useState, useEffect } from "react";

export default function Header() {
  const { connectionStatus, adcThreshold, frameRate } = useCANContext();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";

  return (
    <header className="h-10 min-h-[40px] flex items-center justify-between px-3 border-b border-border/50 bg-card/80 backdrop-blur-sm">
      {/* 左侧：品牌 */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-primary" />
          </div>
          <div className="leading-none">
            <div className="text-xs font-display font-bold tracking-wide">矩侨工业</div>
            <div className="text-[9px] text-muted-foreground font-mono tracking-wider">
              CAN传感器验收分析系统 v1.0
            </div>
          </div>
        </div>
      </div>

      {/* 右侧：状态指示 */}
      <div className="flex items-center gap-4">
        {isActive && (
          <>
            <div className="flex items-center gap-1.5 text-[11px]">
              <Signal className="w-3 h-3 text-chart-1" />
              <span className="text-muted-foreground">ADC&gt;{adcThreshold}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground font-mono">
                {frameRate} fps
              </span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span className="font-mono">
            {time.toLocaleTimeString("zh-CN", { hour12: false })}
          </span>
        </div>
      </div>
    </header>
  );
}
