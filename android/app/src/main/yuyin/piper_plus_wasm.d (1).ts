import { useState, useEffect, useCallback } from 'react';
import ttsEngine, { initializeTTS, TTS_STATUS } from '../lib/tts-tool/index.js';

export interface UseTTSOptions {
  i18n?: any;
  locale?: string;
  model?: string;
  showProgressBar?: boolean;
  onStatusChange?: (status: string) => void;
  onProgress?: (data: { stage: string; progress: number; message: string }) => void;
  onError?: (error: Error) => void;
}

export function useTTS(options: UseTTSOptions = {}) {
  const [status, setStatus] = useState<string>(ttsEngine.status);
  const [isPlaying, setIsPlaying] = useState<boolean>(ttsEngine.isPlaying);
  const [isPaused, setIsPaused] = useState<boolean>(ttsEngine.isPaused);
  const [queueLength, setQueueLength] = useState<number>(ttsEngine.queueLength);

  // 定时轮询更新播放状态和队列长度
  useEffect(() => {
    const timer = setInterval(() => {
      setIsPlaying(ttsEngine.isPlaying);
      setIsPaused(ttsEngine.isPaused);
      setQueueLength(ttsEngine.queueLength);
      setStatus(ttsEngine.status);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  // 初始化 TTS 引擎
  const init = useCallback(async (initOptions: UseTTSOptions = {}) => {
    const mergedOptions = { ...options, ...initOptions };
    try {
      await initializeTTS({
        i18n: mergedOptions.i18n,
        locale: mergedOptions.locale,
        model: mergedOptions.model,
        showProgressBar: mergedOptions.showProgressBar,
        onProgress: mergedOptions.onProgress,
        onStatusChange: (s: string) => {
          setStatus(s);
          mergedOptions.onStatusChange?.(s);
        },
        onError: mergedOptions.onError,
      });
    } catch (err) {
      console.error('[useTTS] Init error:', err);
    }
  }, [options]);

  const speak = useCallback((textOrKey: string, lang?: string) => {
    return ttsEngine.speak(textOrKey, lang);
  }, []);

  const speakUrgent = useCallback((textOrKey: string, lang?: string) => {
    return ttsEngine.speakUrgent(textOrKey, lang);
  }, []);

  const pause = useCallback(() => {
    ttsEngine.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    ttsEngine.resume();
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    ttsEngine.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setQueueLength(0);
  }, []);

  const skip = useCallback(() => {
    ttsEngine.skip();
  }, []);

  const clearQueue = useCallback(() => {
    ttsEngine.clearQueue();
    setQueueLength(0);
  }, []);

  const setLocale = useCallback((locale: string) => {
    ttsEngine.setLocale(locale);
  }, []);

  return {
    status,
    isReady: status === TTS_STATUS.READY,
    isInitializing: status === TTS_STATUS.INITIALIZING,
    isPlaying,
    isPaused,
    queueLength,
    init,
    speak,
    speakUrgent,
    pause,
    resume,
    stop,
    skip,
    clearQueue,
    setLocale,
    ttsEngine, // 暴露原始实例以便进行高级操作
  };
}
