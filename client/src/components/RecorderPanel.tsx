/**
 * 单帧采集/多帧采集控制面板
 * 支持单帧快照、多帧连续采集、回放、导入导出
 */
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RecorderState, RecordingSession } from "@/hooks/useRecorder";
import {
  Camera,
  Circle,
  Download,
  FastForward,
  FileUp,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface RecorderPanelProps {
  state: RecorderState;
  frameCount: number;
  currentFrameIndex: number;
  playbackSpeed: number;
  sessions: RecordingSession[];
  activeSession: RecordingSession | null;
  isConnected: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onStartPlayback: () => void;
  onPausePlayback: () => void;
  onStopPlayback: () => void;
  onSeekToFrame: (index: number) => void;
  onSetPlaybackSpeed: (speed: number) => void;
  onLoadSession: (session: RecordingSession) => void;
  onExportSession: (session: RecordingSession) => void;
  onImportSession: () => void;
  onDeleteSession: (id: string) => void;
  onCaptureFrame?: () => void;
  recordingStartTime?: number | null;
}

export default function RecorderPanel({
  state,
  frameCount,
  currentFrameIndex,
  playbackSpeed,
  sessions,
  activeSession,
  isConnected,
  onStartRecording,
  onStopRecording,
  onStartPlayback,
  onPausePlayback,
  onStopPlayback,
  onSeekToFrame,
  onSetPlaybackSpeed,
  onLoadSession,
  onExportSession,
  onImportSession,
  onDeleteSession,
  onCaptureFrame,
  recordingStartTime,
}: RecorderPanelProps) {
  const isRecording = state === "recording";
  const isPlaying = state === "playing";
  const isPaused = state === "paused";
  const hasFrames = frameCount > 0;

  const speeds = [0.25, 0.5, 1, 2, 4];

  // Recording elapsed time counter
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording && recordingStartTime) {
      setElapsedSeconds(Math.floor((Date.now() - recordingStartTime) / 1000));
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - recordingStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedSeconds(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording, recordingStartTime]);

  return (
    <div className="industrial-panel rounded-md overflow-hidden">
      <div className="industrial-panel-header flex items-center gap-2">
        <Camera className={`w-3 h-3 ${isRecording ? "text-danger-red animate-pulse" : ""}`} />
        <span>单帧采集 / 多帧采集</span>
        {isRecording && (
          <span className="ml-auto text-danger-red text-[9px] animate-pulse">REC</span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Single Frame Capture */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full h-7 text-[10px] font-mono justify-start border-industrial-border hover:border-jq-blue/50 hover:text-jq-blue"
              onClick={onCaptureFrame}
              disabled={!isConnected || isRecording || isPlaying}
            >
              <Camera className="w-3 h-3 mr-1.5" />
              单帧采集
            </Button>
          </TooltipTrigger>
          <TooltipContent>采集当前帧数据快照</TooltipContent>
        </Tooltip>

        {/* Multi-Frame Recording Controls */}
        <div className="flex gap-2">
          {!isRecording ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-[10px] font-mono justify-start border-industrial-border hover:border-danger-red/50 hover:text-danger-red"
                  onClick={onStartRecording}
                  disabled={!isConnected || isPlaying}
                >
                  <Circle className="w-3 h-3 mr-1.5 fill-current" />
                  多帧采集
                </Button>
              </TooltipTrigger>
              <TooltipContent>开始连续采集多帧数据</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-7 text-[10px] font-mono justify-start border-danger-red/50 text-danger-red animate-pulse"
              onClick={onStopRecording}
            >
              <Square className="w-3 h-3 mr-1.5 fill-current" />
              停止采集 ({elapsedSeconds}s)
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] font-mono border-industrial-border"
                onClick={onImportSession}
                disabled={isRecording}
              >
                <FileUp className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>导入采集文件</TooltipContent>
          </Tooltip>
        </div>

        {/* Playback Controls */}
        {hasFrames && !isRecording && (
          <div className="space-y-2">
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                <span>帧 {currentFrameIndex + 1} / {frameCount}</span>
                <span>{playbackSpeed}x</span>
              </div>
              <div className="relative h-1.5 bg-background/50 rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = (e.clientX - rect.left) / rect.width;
                  onSeekToFrame(Math.round(ratio * (frameCount - 1)));
                }}
              >
                <div
                  className="absolute left-0 top-0 h-full bg-jq-blue rounded-full transition-[width] duration-75"
                  style={{ width: `${frameCount > 1 ? (currentFrameIndex / (frameCount - 1)) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Transport controls */}
            <div className="flex items-center justify-center gap-1">
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => onSeekToFrame(0)}
              >
                <SkipBack className="w-3 h-3" />
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => onSeekToFrame(Math.max(0, currentFrameIndex - 10))}
              >
                <Rewind className="w-3 h-3" />
              </button>

              {isPlaying ? (
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-jq-blue/20 text-jq-blue-bright hover:bg-jq-blue/30 transition-colors"
                  onClick={onPausePlayback}
                >
                  <Pause className="w-4 h-4" />
                </button>
              ) : (
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-jq-blue/20 text-jq-blue-bright hover:bg-jq-blue/30 transition-colors"
                  onClick={onStartPlayback}
                >
                  <Play className="w-4 h-4 ml-0.5" />
                </button>
              )}

              <button
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => onSeekToFrame(Math.min(frameCount - 1, currentFrameIndex + 10))}
              >
                <FastForward className="w-3 h-3" />
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                onClick={() => onSeekToFrame(frameCount - 1)}
              >
                <SkipForward className="w-3 h-3" />
              </button>

              {(isPlaying || isPaused) && (
                <button
                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ml-1"
                  onClick={onStopPlayback}
                >
                  <Square className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Speed controls */}
            <div className="flex items-center gap-1 justify-center">
              {speeds.map((speed) => (
                <button
                  key={speed}
                  className={`px-1.5 py-0.5 text-[8px] font-mono rounded border transition-colors ${
                    playbackSpeed === speed
                      ? "bg-jq-blue/20 border-jq-blue/50 text-jq-blue-bright"
                      : "bg-background/30 border-border/50 text-muted-foreground hover:border-jq-blue/30"
                  }`}
                  onClick={() => onSetPlaybackSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Session List */}
        {sessions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider border-t border-border/30 pt-2">
              采集记录 ({sessions.length})
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center gap-1.5 p-1.5 rounded text-[9px] font-mono cursor-pointer transition-colors ${
                    activeSession?.id === session.id
                      ? "bg-jq-blue/10 border border-jq-blue/30"
                      : "bg-background/30 border border-transparent hover:border-border/50"
                  }`}
                  onClick={() => onLoadSession(session)}
                >
                  <div className="flex-1 truncate">
                    <div className="text-foreground/80 truncate">{session.name}</div>
                    <div className="text-muted-foreground/50">
                      {session.frameCount}帧 · {session.matrixSize}
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onExportSession(session);
                      }}
                    >
                      <Download className="w-2.5 h-2.5" />
                    </button>
                    <button
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
