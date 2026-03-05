/**
 * Design: Dark Tech Dashboard — Automotive HMI + Data Dashboard
 * Layout: Left sidebar nav + main content area
 * Colors: Deep navy (#0B1120) base, cyan (#06B6D4) primary, emerald/amber/red status
 * Fonts: Space Grotesk (display), DM Sans (body), Fira Code (hex data)
 */
import { useState } from "react";
import { SerialProvider } from "@/contexts/SerialContext";
import Sidebar from "@/components/Sidebar";
import SerialPanel from "@/components/SerialPanel";
import AirbagControl from "@/components/AirbagControl";
import CommandManager from "@/components/CommandManager";
import ComboManager from "@/components/ComboManager";
import CommLog from "@/components/CommLog";

export type TabId = "control" | "commands" | "combos" | "log";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("control");

  return (
    <SerialProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Left sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top bar with serial connection */}
          <SerialPanel />

          {/* Content area */}
          <main className="flex-1 overflow-auto p-4 lg:p-6">
            {activeTab === "control" && <AirbagControl />}
            {activeTab === "commands" && <CommandManager />}
            {activeTab === "combos" && <ComboManager />}
            {activeTab === "log" && <CommLog />}
          </main>
        </div>
      </div>
    </SerialProvider>
  );
}
