/**
 * v2.0 Header — 顶部状态栏
 * 左: 品牌logo + 系统名称
 * 右: 过滤标签 | 矩阵尺寸 | 帧率 | 帧计数 | 时间 | 暗色切换
 */
import { useState, useEffect } from "react";
import { useCANContext } from "@/contexts/CANContext";
import { CAN_ID_BACKREST, formatMatrixSize } from "@/lib/canProtocol";
import { useTheme } from "@/contexts/ThemeContext";
import { Grid3x3, Zap, Hash, Clock, Moon, Sun } from "lucide-react";

export default function Header() {
  const { connectionStatus, adcThreshold, frameRate, frameCount, activeDevice, backrestTrackedRegion, cushionTrackedRegion } = useCANContext();
  const region = activeDevice === CAN_ID_BACKREST ? backrestTrackedRegion : cushionTrackedRegion;
  const { theme, toggleTheme } = useTheme();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isActive = connectionStatus === "connected" || connectionStatus === "simulating";

  const timeStr = time.toLocaleTimeString("zh-CN", { hour12: false });

  return (
    <header className="h-11 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
      {/* 左侧品牌 */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-primary-foreground" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground tracking-tight">矩侨工业</span>
          <span className="text-xs text-muted-foreground">|</span>
          <span className="text-xs text-muted-foreground tracking-wide">CAN传感器验收分析系统</span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">v2.0</span>
        </div>
      </div>

      {/* 右侧状态指标 */}
      <div className="flex items-center gap-3">
        {/* 过滤标签 */}
        {adcThreshold > 0 && (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-primary/10 text-primary border border-primary/20">
            ADC&gt;{adcThreshold}
          </span>
        )}

        {/* 矩阵尺寸 */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Grid3x3 className="w-3.5 h-3.5" />
          <span className="font-mono">{isActive ? formatMatrixSize(region) : "--"}</span>
          <span className="text-[10px]">({isActive ? `${region.rows * region.cols}点` : "--"})</span>
        </div>

        {/* 帧率 */}
        <div className="flex items-center gap-1 text-xs">
          <Zap className={`w-3.5 h-3.5 ${isActive ? "text-success" : "text-muted-foreground"}`} />
          <span className={`font-mono font-semibold ${isActive ? "text-success" : "text-muted-foreground"}`}>
            {isActive ? frameRate : 0} FPS
          </span>
        </div>

        {/* 帧计数 */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Hash className="w-3.5 h-3.5" />
          <span className="font-mono">{frameCount}</span>
        </div>

        {/* 时间 */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">{timeStr}</span>
        </div>

        {/* 暗色模式切换 */}
        <button
          onClick={toggleTheme}
          className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
}
