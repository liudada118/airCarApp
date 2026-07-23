/**
 * ttsProgressBar.js — TTS 引擎初始化进度条组件
 *
 * 纯 JavaScript 实现，不依赖任何 UI 框架。
 * 在 TTS 引擎初始化时显示加载进度，完成后自动隐藏。
 *
 * @module ttsProgressBar
 */

// ---------------------------------------------------------------------------
// 默认样式
// ---------------------------------------------------------------------------

const DEFAULT_STYLES = {
  // 容器
  container: {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: '99999',
    transition: 'opacity 0.3s ease',
  },
  // 面板
  panel: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '32px 40px',
    minWidth: '360px',
    maxWidth: '480px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
    textAlign: 'center',
  },
  // 标题
  title: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333333',
    marginBottom: '16px',
  },
  // 进度条外框
  progressTrack: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e8e8e8',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  // 进度条填充
  progressFill: {
    height: '100%',
    backgroundColor: '#4a90d9',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    width: '0%',
  },
  // 状态文字
  message: {
    fontSize: '13px',
    color: '#666666',
    marginBottom: '8px',
  },
  // 百分比
  percentage: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#4a90d9',
  },
};

// ---------------------------------------------------------------------------
// i18n 文案
// ---------------------------------------------------------------------------

const PROGRESS_I18N = {
  ja: {
    title: '音声エンジン初期化中',
    stages: {
      ort: 'ONNX Runtime を読み込み中...',
      model: 'モデルをダウンロード中...',
      phonemizer: '音素化エンジンを初期化中...',
      ready: '準備完了！',
    },
    error: '初期化エラー',
    retry: '再試行',
  },
  zh: {
    title: '语音引擎初始化中',
    stages: {
      ort: '正在加载 ONNX Runtime...',
      model: '正在下载模型...',
      phonemizer: '正在初始化音素化引擎...',
      ready: '准备就绪！',
    },
    error: '初始化错误',
    retry: '重试',
  },
  en: {
    title: 'Initializing Speech Engine',
    stages: {
      ort: 'Loading ONNX Runtime...',
      model: 'Downloading model...',
      phonemizer: 'Initializing phonemizer...',
      ready: 'Ready!',
    },
    error: 'Initialization Error',
    retry: 'Retry',
  },
};

// ---------------------------------------------------------------------------
// TTSProgressBar 类
// ---------------------------------------------------------------------------

class TTSProgressBar {
  /**
   * @param {Object} [options]
   * @param {string} [options.locale] - 语言 ('ja'|'zh'|'en')
   * @param {HTMLElement} [options.container] - 挂载容器，默认 document.body
   * @param {Object} [options.styles] - 自定义样式覆盖
   * @param {boolean} [options.autoHide] - 完成后自动隐藏，默认 true
   * @param {number} [options.hideDelay] - 完成后隐藏延迟（ms），默认 800
   */
  constructor(options = {}) {
    this._locale = options.locale || 'ja';
    this._container = options.container || document.body;
    this._styles = { ...DEFAULT_STYLES, ...options.styles };
    this._autoHide = options.autoHide !== false;
    this._hideDelay = options.hideDelay || 800;

    this._el = null;
    this._progressFill = null;
    this._messageEl = null;
    this._percentageEl = null;
    this._titleEl = null;

    this._currentProgress = 0;
    this._isVisible = false;
  }

  // =========================================================================
  // 公开方法
  // =========================================================================

  /**
   * 显示进度条。
   */
  show() {
    if (this._isVisible) return;
    this._create();
    this._isVisible = true;

    // 触发动画
    requestAnimationFrame(() => {
      if (this._el) {
        this._el.style.opacity = '1';
      }
    });
  }

  /**
   * 隐藏进度条。
   */
  hide() {
    if (!this._isVisible || !this._el) return;

    this._el.style.opacity = '0';
    setTimeout(() => {
      this._destroy();
      this._isVisible = false;
    }, 300);
  }

  /**
   * 更新进度。
   * @param {Object} data
   * @param {string} data.stage - 阶段 ('ort'|'model'|'phonemizer'|'ready')
   * @param {number} data.progress - 进度 0-1
   * @param {string} [data.message] - 自定义消息
   */
  update({ stage, progress, message }) {
    if (!this._isVisible) this.show();

    // 计算总进度（ort: 0-10%, model: 10-80%, phonemizer: 80-95%, ready: 100%）
    let totalProgress = 0;
    switch (stage) {
      case 'ort':
        totalProgress = progress * 0.1;
        break;
      case 'model':
        totalProgress = 0.1 + progress * 0.7;
        break;
      case 'phonemizer':
        totalProgress = 0.8 + progress * 0.15;
        break;
      case 'ready':
        totalProgress = 1;
        break;
      default:
        totalProgress = this._currentProgress;
    }

    this._currentProgress = Math.max(this._currentProgress, totalProgress);
    const percent = Math.round(this._currentProgress * 100);

    // 更新 UI
    if (this._progressFill) {
      this._progressFill.style.width = `${percent}%`;
    }
    if (this._percentageEl) {
      this._percentageEl.textContent = `${percent}%`;
    }
    if (this._messageEl) {
      const i18n = PROGRESS_I18N[this._locale] || PROGRESS_I18N.en;
      const stageText = i18n.stages[stage] || message || '';
      this._messageEl.textContent = stageText;
    }

    // 完成后自动隐藏
    if (stage === 'ready' && this._autoHide) {
      if (this._progressFill) {
        this._progressFill.style.backgroundColor = '#52c41a'; // 绿色
      }
      setTimeout(() => this.hide(), this._hideDelay);
    }
  }

  /**
   * 显示错误状态。
   * @param {string} [errorMessage]
   */
  showError(errorMessage) {
    if (!this._isVisible) this.show();

    const i18n = PROGRESS_I18N[this._locale] || PROGRESS_I18N.en;

    if (this._progressFill) {
      this._progressFill.style.backgroundColor = '#ff4d4f'; // 红色
    }
    if (this._messageEl) {
      this._messageEl.textContent = errorMessage || i18n.error;
      this._messageEl.style.color = '#ff4d4f';
    }
    if (this._titleEl) {
      this._titleEl.textContent = i18n.error;
    }
  }

  /**
   * 设置语言。
   * @param {string} locale
   */
  setLocale(locale) {
    this._locale = locale;
    if (this._titleEl) {
      const i18n = PROGRESS_I18N[locale] || PROGRESS_I18N.en;
      this._titleEl.textContent = i18n.title;
    }
  }

  /**
   * 销毁组件。
   */
  destroy() {
    this._destroy();
    this._isVisible = false;
  }

  // =========================================================================
  // 内部方法
  // =========================================================================

  /** @private */
  _create() {
    const i18n = PROGRESS_I18N[this._locale] || PROGRESS_I18N.en;

    // 创建遮罩容器
    this._el = document.createElement('div');
    this._el.className = 'tts-progress-overlay';
    Object.assign(this._el.style, this._styles.container);
    this._el.style.opacity = '0';

    // 面板
    const panel = document.createElement('div');
    panel.className = 'tts-progress-panel';
    Object.assign(panel.style, this._styles.panel);

    // 标题
    this._titleEl = document.createElement('div');
    this._titleEl.className = 'tts-progress-title';
    Object.assign(this._titleEl.style, this._styles.title);
    this._titleEl.textContent = i18n.title;

    // 进度条轨道
    const track = document.createElement('div');
    track.className = 'tts-progress-track';
    Object.assign(track.style, this._styles.progressTrack);

    // 进度条填充
    this._progressFill = document.createElement('div');
    this._progressFill.className = 'tts-progress-fill';
    Object.assign(this._progressFill.style, this._styles.progressFill);
    track.appendChild(this._progressFill);

    // 状态消息
    this._messageEl = document.createElement('div');
    this._messageEl.className = 'tts-progress-message';
    Object.assign(this._messageEl.style, this._styles.message);
    this._messageEl.textContent = i18n.stages.ort;

    // 百分比
    this._percentageEl = document.createElement('div');
    this._percentageEl.className = 'tts-progress-percentage';
    Object.assign(this._percentageEl.style, this._styles.percentage);
    this._percentageEl.textContent = '0%';

    // 组装
    panel.appendChild(this._titleEl);
    panel.appendChild(track);
    panel.appendChild(this._messageEl);
    panel.appendChild(this._percentageEl);
    this._el.appendChild(panel);

    this._container.appendChild(this._el);
  }

  /** @private */
  _destroy() {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
    this._progressFill = null;
    this._messageEl = null;
    this._percentageEl = null;
    this._titleEl = null;
    this._currentProgress = 0;
  }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export default TTSProgressBar;
export { TTSProgressBar, PROGRESS_I18N };
