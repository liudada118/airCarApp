/**
 * Design: Automotive HMI Dark Console — CAN Seat Sensor Dashboard
 * Layout: Header + Left sidebar + Center matrix + Right data panel
 * Colors: Deep navy (#0B1120) base, blue (#2563EB) primary, cyan/emerald/amber status
 * Fonts: Space Grotesk (display), DM Sans (body), Fira Code (data)
 */
import { CANProvider } from "@/contexts/CANContext";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import PressureMatrix from "@/components/PressureMatrix";
import DataPanel from "@/components/DataPanel";

export default function Home() {
  return (
    <CANProvider>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Top header */}
        <Header />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left sidebar — device management & config */}
          <Sidebar />

          {/* Center — pressure matrix visualization */}
          <main className="flex-1 flex flex-col overflow-hidden">
            <PressureMatrix />
          </main>

          {/* Right panel — data analysis */}
          <DataPanel />
        </div>
      </div>
    </CANProvider>
  );
}
