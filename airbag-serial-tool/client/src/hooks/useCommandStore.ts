import { useCallback, useEffect, useState } from "react";
import type { SavedCommand, CommandCombo } from "@/lib/protocol";
import { nanoid } from "nanoid";

const COMMANDS_KEY = "airbag_saved_commands";
const COMBOS_KEY = "airbag_command_combos";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error("Storage save error:", e);
  }
}

export function useCommandStore() {
  const [commands, setCommands] = useState<SavedCommand[]>(() =>
    loadFromStorage(COMMANDS_KEY, [])
  );
  const [combos, setCombos] = useState<CommandCombo[]>(() =>
    loadFromStorage(COMBOS_KEY, [])
  );

  useEffect(() => {
    saveToStorage(COMMANDS_KEY, commands);
  }, [commands]);

  useEffect(() => {
    saveToStorage(COMBOS_KEY, combos);
  }, [combos]);

  const addCommand = useCallback(
    (cmd: Omit<SavedCommand, "id" | "createdAt">) => {
      const newCmd: SavedCommand = {
        ...cmd,
        id: nanoid(),
        createdAt: Date.now(),
      };
      setCommands((prev) => [newCmd, ...prev]);
      return newCmd;
    },
    []
  );

  const removeCommand = useCallback((id: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== id));
    // Also remove from combos
    setCombos((prev) =>
      prev.map((combo) => ({
        ...combo,
        steps: combo.steps.filter((s) => s.commandId !== id),
      }))
    );
  }, []);

  const updateCommand = useCallback(
    (id: string, updates: Partial<Omit<SavedCommand, "id" | "createdAt">>) => {
      setCommands((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  const addCombo = useCallback(
    (combo: Omit<CommandCombo, "id" | "createdAt">) => {
      const newCombo: CommandCombo = {
        ...combo,
        id: nanoid(),
        createdAt: Date.now(),
      };
      setCombos((prev) => [newCombo, ...prev]);
      return newCombo;
    },
    []
  );

  const removeCombo = useCallback((id: string) => {
    setCombos((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateCombo = useCallback(
    (id: string, updates: Partial<Omit<CommandCombo, "id" | "createdAt">>) => {
      setCombos((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
      );
    },
    []
  );

  return {
    commands,
    combos,
    addCommand,
    removeCommand,
    updateCommand,
    addCombo,
    removeCombo,
    updateCombo,
  };
}
