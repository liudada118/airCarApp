/**
 * v2.0 CAN Seat Sensor Dashboard
 * Layout: Header + Left sidebar (250px) + Center matrix + Right panel (300px)
 * Theme: Light mode with blue primary, professional industrial UI
 */
import { CANProvider } from "@/contexts/CANContext";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import PressureMatrix from "@/components/PressureMatrix";
import DataPanel from "@/components/DataPanel";

export default function Home() {
  return (
    <CANProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-background">
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

          {/* Right panel — acceptance & metrics */}
          <DataPanel />
        </div>
      </div>
    </CANProvider>
  );
}
