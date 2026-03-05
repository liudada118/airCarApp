import { createContext, useContext, type ReactNode } from "react";
import { useSerial, type UseSerialReturn } from "@/hooks/useSerial";
import { useCommandStore } from "@/hooks/useCommandStore";
import type { SavedCommand, CommandCombo } from "@/lib/protocol";

interface SerialContextValue extends UseSerialReturn {
  commands: SavedCommand[];
  combos: CommandCombo[];
  addCommand: (cmd: Omit<SavedCommand, "id" | "createdAt">) => SavedCommand;
  removeCommand: (id: string) => void;
  updateCommand: (id: string, updates: Partial<Omit<SavedCommand, "id" | "createdAt">>) => void;
  addCombo: (combo: Omit<CommandCombo, "id" | "createdAt">) => CommandCombo;
  removeCombo: (id: string) => void;
  updateCombo: (id: string, updates: Partial<Omit<CommandCombo, "id" | "createdAt">>) => void;
}

const SerialContext = createContext<SerialContextValue | null>(null);

export function SerialProvider({ children }: { children: ReactNode }) {
  const serial = useSerial();
  const store = useCommandStore();

  return (
    <SerialContext.Provider value={{ ...serial, ...store }}>
      {children}
    </SerialContext.Provider>
  );
}

export function useSerialContext() {
  const ctx = useContext(SerialContext);
  if (!ctx) throw new Error("useSerialContext must be used within SerialProvider");
  return ctx;
}
