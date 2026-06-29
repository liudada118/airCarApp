/**
 * 多帧数据录制回放 Hook
 * 支持录制连续帧数据、保存、加载、回放
 */
import { useCallback, useRef, useState } from "react";
import type { MatrixSize } from "@/lib/serial-service";

export interface RecordedFrame {
  timestamp: number;
  data: number[];
}

export interface RecordingSession {
  id: string;
  name: string;
  matrixSize: MatrixSize;
  startTime: number;
  endTime: number;
  frameCount: number;
  frames: RecordedFrame[];
}

export type RecorderState = "idle" | "recording" | "playing" | "paused";

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [frames, setFrames] = useState<RecordedFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(null);

  const recordingRef = useRef<RecordedFrame[]>([]);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartTimeRef = useRef<number>(0);
  const matrixSizeRef = useRef<MatrixSize>("32x32");

  // Start recording
  const startRecording = useCallback((matrixSize: MatrixSize) => {
    recordingRef.current = [];
    recordStartTimeRef.current = Date.now();
    matrixSizeRef.current = matrixSize;
    setState("recording");
    setFrames([]);
    setCurrentFrameIndex(0);
  }, []);

  // Record a frame
  const recordFrame = useCallback((data: number[]) => {
    if (recordingRef.current !== null) {
      recordingRef.current.push({
        timestamp: Date.now() - recordStartTimeRef.current,
        data: [...data],
      });
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback((name?: string) => {
    const recorded = recordingRef.current;
    if (recorded.length === 0) {
      setState("idle");
      return null;
    }

    const session: RecordingSession = {
      id: `rec_${Date.now()}`,
      name: name || `录制 ${new Date().toLocaleString("zh-CN")}`,
      matrixSize: matrixSizeRef.current,
      startTime: recordStartTimeRef.current,
      endTime: Date.now(),
      frameCount: recorded.length,
      frames: recorded,
    };

    setSessions(prev => [session, ...prev]);
    setFrames(recorded);
    setActiveSession(session);
    setState("idle");
    recordingRef.current = [];
    return session;
  }, []);

  // Load a session for playback
  const loadSession = useCallback((session: RecordingSession) => {
    stopPlayback();
    setActiveSession(session);
    setFrames(session.frames);
    setCurrentFrameIndex(0);
    setState("idle");
  }, []);

  // Start playback
  const startPlayback = useCallback(() => {
    if (frames.length === 0) return;
    setState("playing");

    const baseInterval = frames.length > 1
      ? Math.max(16, (frames[1].timestamp - frames[0].timestamp))
      : 72;

    playbackTimerRef.current = setInterval(() => {
      setCurrentFrameIndex(prev => {
        const next = prev + 1;
        if (next >= frames.length) {
          // Loop back to start
          return 0;
        }
        return next;
      });
    }, baseInterval / playbackSpeed);
  }, [frames, playbackSpeed]);

  // Pause playback
  const pausePlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setState("paused");
  }, []);

  // Stop playback
  const stopPlayback = useCallback(() => {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    setState("idle");
    setCurrentFrameIndex(0);
  }, []);

  // Seek to a specific frame
  const seekToFrame = useCallback((index: number) => {
    setCurrentFrameIndex(Math.max(0, Math.min(index, frames.length - 1)));
  }, [frames.length]);

  // Export session to CSV file
  const exportSession = useCallback((session: RecordingSession) => {
    const lines: string[] = [];
    // Header metadata (prefixed with #)
    lines.push(`#矩侨工业 - 压力传感器多帧采集数据`);
    lines.push(`#导出时间: ${new Date().toISOString()}`);
    lines.push(`#矩阵规格: ${session.matrixSize}`);
    lines.push(`#帧数: ${session.frameCount}`);
    lines.push(`#时长(ms): ${session.endTime - session.startTime}`);
    lines.push(`#`);
    // Parse matrix dimension
    const dim = parseInt(session.matrixSize.split("x")[0]);
    const totalCells = dim * dim;
    // Column header: timestamp, cell_0, cell_1, ..., cell_N
    const colHeaders = ["timestamp_ms"];
    for (let i = 0; i < totalCells; i++) {
      colHeaders.push(`R${Math.floor(i / dim)}C${i % dim}`);
    }
    lines.push(colHeaders.join(","));
    // Data rows: one row per frame
    for (const frame of session.frames) {
      const row = [String(frame.timestamp)];
      for (let i = 0; i < totalCells; i++) {
        row.push(String(frame.data[i] ?? 0));
      }
      lines.push(row.join(","));
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JQ_Recording_${session.matrixSize}_${session.frameCount}frames_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Import session from CSV file (also supports legacy JSON)
  const importSession = useCallback(() => {
    return new Promise<RecordingSession | null>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".csv,.json";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const text = ev.target?.result as string;
            let session: RecordingSession;

            if (file.name.endsWith(".json")) {
              // Legacy JSON format
              const data = JSON.parse(text);
              session = {
                id: `imp_${Date.now()}`,
                name: file.name.replace(".json", ""),
                matrixSize: data.matrixSize || "32x32",
                startTime: Date.now(),
                endTime: Date.now() + (data.duration || 0),
                frameCount: data.frames?.length || 0,
                frames: data.frames || [],
              };
            } else {
              // CSV format
              const rawLines = text.replace(/^\uFEFF/, "").split("\n");
              let matrixSize: MatrixSize = "32x32";
              let duration = 0;
              const dataLines: string[] = [];
              let headerPassed = false;

              for (const line of rawLines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                if (trimmed.startsWith("#")) {
                  // Parse metadata
                  const match = trimmed.match(/#矩阵规格:\s*(.+)/);
                  if (match) matrixSize = match[1].trim() as MatrixSize;
                  const durMatch = trimmed.match(/#时长\(ms\):\s*(\d+)/);
                  if (durMatch) duration = parseInt(durMatch[1]);
                  continue;
                }
                if (!headerPassed) {
                  // Skip column header row
                  headerPassed = true;
                  continue;
                }
                dataLines.push(trimmed);
              }

              const frames: RecordedFrame[] = dataLines.map(line => {
                const cells = line.split(",");
                const timestamp = parseInt(cells[0]) || 0;
                const data = cells.slice(1).map(v => parseInt(v) || 0);
                return { timestamp, data };
              });

              session = {
                id: `imp_${Date.now()}`,
                name: file.name.replace(".csv", ""),
                matrixSize,
                startTime: Date.now(),
                endTime: Date.now() + duration,
                frameCount: frames.length,
                frames,
              };
            }

            setSessions(prev => [session, ...prev]);
            resolve(session);
          } catch {
            resolve(null);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }, []);

  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      setFrames([]);
      setCurrentFrameIndex(0);
      setState("idle");
    }
  }, [activeSession]);

  // Get current playback frame data
  const currentFrame = frames[currentFrameIndex] ?? null;

  return {
    state,
    frames,
    currentFrameIndex,
    currentFrame,
    playbackSpeed,
    sessions,
    activeSession,
    frameCount: frames.length,
    setPlaybackSpeed,
    startRecording,
    recordFrame,
    stopRecording,
    loadSession,
    startPlayback,
    pausePlayback,
    stopPlayback,
    seekToFrame,
    exportSession,
    importSession,
    deleteSession,
  };
}
