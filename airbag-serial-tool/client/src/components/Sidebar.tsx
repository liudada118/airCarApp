/**
 * Design: Dark sidebar with glowing active indicator
 * Automotive HMI style navigation with icon + label
 */
import { Armchair, ListOrdered, Combine, ScrollText } from "lucide-react";
import type { TabId } from "@/pages/Home";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { id: TabId; label: string; icon: typeof Armchair }[] = [
  { id: "control", label: "气囊控制", icon: Armchair },
  { id: "commands", label: "指令管理", icon: ListOrdered },
  { id: "combos", label: "指令组合", icon: Combine },
  { id: "log", label: "通信日志", icon: ScrollText },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-16 lg:w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Logo area */}
      <div className="h-14 flex items-center gap-2.5 px-3 lg:px-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-primary font-bold text-sm font-[Space_Grotesk]">BQ</span>
        </div>
        <div className="hidden lg:block">
          <h1 className="text-sm font-semibold font-[Space_Grotesk] text-foreground leading-tight">
            气囊调试工具
          </h1>
          <p className="text-[10px] text-muted-foreground leading-tight">Serial Debug Tool</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 lg:px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-2.5 lg:px-3 py-2.5 rounded-lg transition-all duration-200",
                "text-sm font-medium",
                isActive
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px] shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 shrink-0 transition-colors",
                  isActive ? "text-primary" : ""
                )}
              />
              <span className="hidden lg:inline">{item.label}</span>
              {isActive && (
                <div className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px] shadow-primary" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="hidden lg:block px-4 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          北汽项目 v1.0
        </p>
        <p className="text-[10px] text-muted-foreground">
          Web Serial API
        </p>
      </div>
    </aside>
  );
}
