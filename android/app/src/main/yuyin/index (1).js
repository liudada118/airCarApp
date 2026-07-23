/**
 * ttsEngine.js — 浏览器内嵌 TTS 语音播报工具
 *
 * 基于 piper-plus WASM 引擎，完全在浏览器内完成文字转语音。
 * 支持 i18n 绑定（日语/中文/英语），队列管理（排队、中断、暂停、恢复）。
 *
 * 依赖：
 *   - piper-plus (npm install piper-plus)
 *   - onnxruntime-web (npm install onnxruntime-web)
 *
 * @module ttsEngine
 */

// ---------------------------------------------------------------------------
// 状态枚举
// ---------------------------------------------------------------------------

export const TTS_STATUS = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error',
};

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  // piper-plus 模型名称（多语言模型，支持 ja/en/zh/es/fr/pt）
  model: 'css10',

  // onnxruntime-web 本地同源加载路径（防止 CDN 跨域导致 WASM .mjs 加载失败）
  ortCdnUrl: '/onnxwasm/ort.all.min.js',

  // 语音参数
  noiseScale: 0.667,
  lengthScale: 1.0,
  noiseW: 0.8,

  // 队列参数
  queueGap: 500, // 队列项之间的间隔（ms）
  maxQueueSize: 50, // 最大队列长度

  // 语言映射：i18n locale → piper-plus language code
  localeToLang: {
    'ja': 'ja',
    'ja-JP': 'ja',
    'zh': 'zh',
    'zh-CN': 'zh',
    'zh-TW': 'zh',
    'en': 'en',
    'en-US': 'en',
    'en-GB': 'en',
  },
};

// ---------------------------------------------------------------------------
// TTS Engine 类
// ---------------------------------------------------------------------------

class TTSEngine {
  constructor() {
    // 状态
    this._status = TTS_STATUS.UNINITIALIZED;
    this._piper = null;
    this._config = { ...DEFAULT_CONFIG };

    // i18n 绑定
    this._i18n = null;
    this._currentLocale = 'ja'; // 默认日语

    // 队列管理
    this._queue = [];
    this._isPlaying = false;
    this._isPaused = false;
    this._currentAudio = null;
    this._playTimer = null;

    // 进度回调
    this._onProgress = null;
    this._onStatusChange = null;
    this._onError = null;

    // 音频上下文（用于更精确的播放控制）
    this._audioContext = null;
  }

  // =========================================================================
  // 公开属性
  // =========================================================================

  /** 当前状态 */
  get status() {
    return this._status;
  }

  /** 是否已初始化就绪 */
  get isReady() {
    return this._status === TTS_STATUS.READY;
  }

  /** 是否正在播放 */
  get isPlaying() {
    return this._isPlaying;
  }

  /** 是否暂停 */
  get isPaused() {
    return this._isPaused;
  }

  /** 当前队列长度 */
  get queueLength() {
    return this._queue.length;
  }

  /** 当前语言 */
  get currentLanguage() {
    return this._resolveLanguage();
  }

  // =========================================================================
  // 公开方法：初始化
  // =========================================================================

  /**
   * 初始化 TTS 引擎。
   * 首次调用时下载模型和 WASM 文件，后续调用从缓存加载。
   *
   * @param {Object} options - 配置选项
   * @param {Object} [options.i18n] - i18n 实例（需要有 locale 或 language 属性）
   * @param {string} [options.model] - piper-plus 模型名称
   * @param {string} [options.locale] - 手动指定语言（如果不绑定 i18n）
   * @param {Function} [options.onProgress] - 进度回调 ({ stage, progress, message })
   * @param {Function} [options.onStatusChange] - 状态变更回调 (status)
   * @param {Function} [options.onError] - 错误回调 (error)
   * @param {Object} [options.piperOptions] - 传递给 PiperPlus.initialize 的额外选项
   * @returns {Promise<void>}
   */
  async init(options = {}) {
    if (this._status === TTS_STATUS.READY) {
      console.warn('[TTS] Already initialized.');
      return;
    }

    if (this._status === TTS_STATUS.INITIALIZING) {
      console.warn('[TTS] Initialization already in progress.');
      return;
    }

    // 合并配置
    if (options.model) this._config.model = options.model;
    if (options.i18n) this._i18n = options.i18n;
    if (options.locale) this._currentLocale = options.locale;
    if (options.onProgress) this._onProgress = options.onProgress;
    if (options.onStatusChange) this._onStatusChange = options.onStatusChange;
    if (options.onError) this._onError = options.onError;

    this._setStatus(TTS_STATUS.INITIALIZING);

    try {
      // Step 1: 确保 onnxruntime-web 已加载
      this._reportProgress('ort', 0, 'Loading ONNX Runtime...');
      await this._ensureOrt();
      this._reportProgress('ort', 1, 'ONNX Runtime loaded.');

      // Step 2: 动态导入 piper-plus 并初始化
      this._reportProgress('model', 0, 'Initializing PiperPlus engine...');

      const { PiperPlus } = await import('piper-plus');

      this._piper = await PiperPlus.initialize({
        model: this._config.model,
        ort: globalThis.ort,
        wasmG2pUrl: '/rust-wasm/piper_plus_wasm.js', // 显式指定浏览器可访问的 WASM G2P 路径
        onProgress: ({ stage, progress, message }) => {
          this._reportProgress(stage, progress, message);
        },
        ...options.piperOptions,
      });

      // =========================================================================
      // Monkey Patch: 解决 css10-ja-6lang 模型的 feeds 缺失和张量维度（Rank）不匹配问题
      // 1. 自动补全 256 维全零 speaker_embedding
      // 2. 将 speaker_embedding_mask 的维度从 [1] 修正为 [1, 1] (Rank 2)
      // =========================================================================
      const originalInfer = this._piper._infer.bind(this._piper);
      this._piper._infer = async (phonemeIds, prosodyFeatures, inferOptions) => {
        if (!inferOptions.speakerEmbedding) {
          // css10 模型需要 256 维的 speaker_embedding
          inferOptions.speakerEmbedding = new Float32Array(256); 
        }
        return originalInfer(phonemeIds, prosodyFeatures, inferOptions);
      };

      // 拦截并修正 ONNX Session Run 中的 feeds 参数
      const patchSession = (session) => {
        if (!session || session.__patched) return;
        const originalRun = session.run.bind(session);
        session.run = async (feeds, options) => {
          if (feeds && feeds.speaker_embedding_mask && feeds.speaker_embedding_mask.dims.length === 1) {
            // 将 speaker_embedding_mask 从 [1] 修正为 [1, 1]
            feeds.speaker_embedding_mask = new globalThis.ort.Tensor(
              'int64',
              new BigInt64Array([1n]),
              [1, 1]
            );
          }
          return originalRun(feeds, options);
        };
        session.__patched = true;
      };

      // 1. 修复当前 session
      if (this._piper._session) {
        patchSession(this._piper._session);
      }

      // 2. 修复可能重建的 session (针对 WebGPU 降级 WASM 等情况)
      if (this._piper._sessionManager) {
        const originalCreateSession = this._piper._sessionManager.createSession.bind(this._piper._sessionManager);
        this._piper._sessionManager.createSession = async (...args) => {
          const session = await originalCreateSession(...args);
          patchSession(session);
          return session;
        };
      }

      this._reportProgress('ready', 1, 'TTS Engine ready.');
      this._setStatus(TTS_STATUS.READY);
    } catch (error) {
      this._setStatus(TTS_STATUS.ERROR);
      this._reportError(error);
      throw error;
    }
  }

  // =========================================================================
  // 公开方法：语音播报
  // =========================================================================

  /**
   * 播报文字（主要接口）。
   *
   * 用法 1：传入 i18n key，自动根据当前语言获取文字
   *   tts.speak('alarm.bedEdgeSitting')
   *
   * 用法 2：直接传入文字和语言
   *   tts.speak('ベッド縁着座', 'ja')
   *
   * @param {string} textOrKey - 要播报的文字，或 i18n 的 key
   * @param {string} [lang] - 语言代码（'ja'|'en'|'zh'）。省略时自动从 i18n 获取
   * @returns {string} 队列项 ID
   */
  speak(textOrKey, lang) {
    if (!this.isReady) {
      console.warn('[TTS] Engine not ready. Call init() first.');
      return null;
    }

    // 解析文字
    const text = this._resolveText(textOrKey);
    // 解析语言
    const language = lang
      ? this._mapLocaleToLang(lang)
      : this._resolveLanguage();

    // 生成唯一 ID
    const id = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 加入队列
    if (this._queue.length >= this._config.maxQueueSize) {
      console.warn('[TTS] Queue full, dropping oldest item.');
      this._queue.shift();
    }

    this._queue.push({ id, text, language, timestamp: Date.now() });

    // 如果没有正在播放，开始播放
    if (!this._isPlaying && !this._isPaused) {
      this._playNext();
    }

    return id;
  }

  /**
   * 紧急播报（中断当前播放，插入队首）。
   *
   * @param {string} textOrKey - 要播报的文字或 i18n key
   * @param {string} [lang] - 语言代码
   * @returns {string} 队列项 ID
   */
  speakUrgent(textOrKey, lang) {
    if (!this.isReady) {
      console.warn('[TTS] Engine not ready. Call init() first.');
      return null;
    }

    const text = this._resolveText(textOrKey);
    const language = lang
      ? this._mapLocaleToLang(lang)
      : this._resolveLanguage();

    const id = `tts_urgent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 中断当前播放
    this._stopCurrent();

    // 插入队首
    this._queue.unshift({ id, text, language, timestamp: Date.now(), urgent: true });

    // 立即播放
    this._playNext();

    return id;
  }

  // =========================================================================
  // 公开方法：队列控制
  // =========================================================================

  /**
   * 暂停播放。
   */
  pause() {
    this._isPaused = true;
    if (this._currentAudio) {
      this._currentAudio.pause();
    }
    if (this._playTimer) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }

  /**
   * 恢复播放。
   */
  resume() {
    if (!this._isPaused) return;
    this._isPaused = false;

    if (this._currentAudio && this._currentAudio.paused) {
      this._currentAudio.play();
    } else {
      this._playNext();
    }
  }

  /**
   * 停止播放并清空队列。
   */
  stop() {
    this._stopCurrent();
    this._queue = [];
    this._isPlaying = false;
    this._isPaused = false;
  }

  /**
   * 跳过当前播放项，播放下一个。
   */
  skip() {
    this._stopCurrent();
    this._playNext();
  }

  /**
   * 清空队列（不中断当前播放）。
   */
  clearQueue() {
    this._queue = [];
  }

  /**
   * 从队列中移除指定 ID 的项。
   * @param {string} id - 队列项 ID
   */
  remove(id) {
    this._queue = this._queue.filter(item => item.id !== id);
  }

  // =========================================================================
  // 公开方法：i18n 绑定
  // =========================================================================

  /**
   * 绑定 i18n 实例。
   * 支持 vue-i18n、i18next 等常见 i18n 库。
   *
   * @param {Object} i18n - i18n 实例
   */
  setI18n(i18n) {
    this._i18n = i18n;
  }

  /**
   * 手动设置当前语言。
   * @param {string} locale - 语言标识（如 'ja', 'zh-CN', 'en-US'）
   */
  setLocale(locale) {
    this._currentLocale = locale;
  }

  // =========================================================================
  // 公开方法：配置
  // =========================================================================

  /**
   * 更新配置。
   * @param {Object} config - 部分配置
   */
  setConfig(config) {
    Object.assign(this._config, config);
  }

  /**
   * 释放资源。
   */
  dispose() {
    this.stop();
    if (this._piper) {
      this._piper.dispose();
      this._piper = null;
    }
    if (this._audioContext) {
      this._audioContext.close();
      this._audioContext = null;
    }
    this._setStatus(TTS_STATUS.UNINITIALIZED);
  }

  // =========================================================================
  // 内部方法：播放控制
  // =========================================================================

  /** @private */
  async _playNext() {
    if (this._isPaused) return;
    if (this._queue.length === 0) {
      this._isPlaying = false;
      return;
    }

    this._isPlaying = true;
    const item = this._queue.shift();

    try {
      // 文字转语音
      const audioResult = await this._piper.synthesize(item.text, {
        language: item.language,
        noiseScale: this._config.noiseScale,
        lengthScale: this._config.lengthScale,
        noiseW: this._config.noiseW,
      });

      // 如果在合成过程中被暂停或停止
      if (this._isPaused || !this._isPlaying) return;

      // 获取 WAV Blob 并播放
      const wavBlob = audioResult.toBlob();
      const audioUrl = URL.createObjectURL(wavBlob);

      await this._playAudio(audioUrl);

      // 释放 URL
      URL.revokeObjectURL(audioUrl);

      // 播放完成，等待间隔后播放下一个
      if (this._queue.length > 0 && !this._isPaused) {
        this._playTimer = setTimeout(() => {
          this._playTimer = null;
          this._playNext();
        }, this._config.queueGap);
      } else {
        this._isPlaying = false;
      }
    } catch (error) {
      console.error('[TTS] Synthesis/playback error:', error);
      this._reportError(error);

      // 出错后继续播放队列中的下一个
      if (this._queue.length > 0 && !this._isPaused) {
        this._playTimer = setTimeout(() => {
          this._playTimer = null;
          this._playNext();
        }, this._config.queueGap);
      } else {
        this._isPlaying = false;
      }
    }
  }

  /** @private */
  _playAudio(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      this._currentAudio = audio;

      audio.onended = () => {
        this._currentAudio = null;
        resolve();
      };

      audio.onerror = (e) => {
        this._currentAudio = null;
        reject(new Error(`Audio playback error: ${e.message || 'unknown'}`));
      };

      audio.play().catch(reject);
    });
  }

  /** @private */
  _stopCurrent() {
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio.currentTime = 0;
      this._currentAudio = null;
    }
    if (this._playTimer) {
      clearTimeout(this._playTimer);
      this._playTimer = null;
    }
  }

  // =========================================================================
  // 内部方法：i18n 解析
  // =========================================================================

  /** @private - 解析文字（支持 i18n key 或直接文字） */
  _resolveText(textOrKey) {
    // 如果绑定了 i18n，尝试翻译
    if (this._i18n) {
      // 支持 vue-i18n (this._i18n.t / this._i18n.global.t)
      const t = this._getTranslateFunction();
      if (t) {
        const translated = t(textOrKey);
        // 如果翻译结果与 key 不同，说明翻译成功
        if (translated && translated !== textOrKey) {
          return translated;
        }
      }
    }
    // 没有 i18n 或翻译失败，直接返回原文
    return textOrKey;
  }

  /** @private - 获取 i18n 翻译函数 */
  _getTranslateFunction() {
    if (!this._i18n) return null;

    // vue-i18n v9+ (Composition API)
    if (this._i18n.global && typeof this._i18n.global.t === 'function') {
      return this._i18n.global.t.bind(this._i18n.global);
    }
    // vue-i18n v8 或通用
    if (typeof this._i18n.t === 'function') {
      return this._i18n.t.bind(this._i18n);
    }
    // i18next
    if (typeof this._i18n.t === 'function') {
      return this._i18n.t.bind(this._i18n);
    }
    return null;
  }

  /** @private - 解析当前语言 */
  _resolveLanguage() {
    let locale = this._currentLocale;

    if (this._i18n) {
      // vue-i18n v9+
      if (this._i18n.global && this._i18n.global.locale) {
        locale = typeof this._i18n.global.locale === 'object'
          ? this._i18n.global.locale.value  // ref
          : this._i18n.global.locale;
      }
      // vue-i18n v8 或通用
      else if (this._i18n.locale) {
        locale = this._i18n.locale;
      }
      // i18next
      else if (this._i18n.language) {
        locale = this._i18n.language;
      }
    }

    return this._mapLocaleToLang(locale);
  }

  /** @private - 将 locale 映射为 piper-plus 语言代码 */
  _mapLocaleToLang(locale) {
    if (!locale) return 'ja';
    // 直接匹配
    if (this._config.localeToLang[locale]) {
      return this._config.localeToLang[locale];
    }
    // 取前两位匹配
    const short = locale.split('-')[0].split('_')[0].toLowerCase();
    if (this._config.localeToLang[short]) {
      return this._config.localeToLang[short];
    }
    // 默认日语
    return 'ja';
  }

  // =========================================================================
  // 内部方法：工具
  // =========================================================================

  /** @private - 确保 onnxruntime-web 已加载 */
  async _ensureOrt() {
    if (globalThis.ort) {
      // 即使已经加载，也确保配置好本地 WASM 路径
      if (globalThis.ort.env && globalThis.ort.env.wasm) {
        globalThis.ort.env.wasm.wasmPaths = '/onnxwasm/';
      }
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this._config.ortCdnUrl;
      script.onload = () => {
        if (globalThis.ort) {
          // 显式配置 onnxruntime-web 寻找 WASM 文件的本地相对路径
          if (globalThis.ort.env && globalThis.ort.env.wasm) {
            globalThis.ort.env.wasm.wasmPaths = '/onnxwasm/';
          }
          resolve();
        } else {
          reject(new Error('onnxruntime-web loaded but ort not found on globalThis'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load onnxruntime-web'));
      document.head.appendChild(script);
    });
  }

  /** @private - 设置状态 */
  _setStatus(status) {
    this._status = status;
    if (this._onStatusChange) {
      this._onStatusChange(status);
    }
  }

  /** @private - 报告进度 */
  _reportProgress(stage, progress, message) {
    if (this._onProgress) {
      this._onProgress({ stage, progress, message });
    }
  }

  /** @private - 报告错误 */
  _reportError(error) {
    if (this._onError) {
      this._onError(error);
    }
  }
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

/** TTS 引擎单例 */
const ttsEngine = new TTSEngine();

export default ttsEngine;
export { TTSEngine };
