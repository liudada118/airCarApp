/**
 * index.js — TTS 工具库入口
 *
 * 整合了 ttsEngine (核心引擎) 和 ttsProgressBar (进度条组件)，
 * 提供一键初始化和便捷调用的高级封装。
 *
 * @module tts-tool
 */

import ttsEngine, { TTSEngine, TTS_STATUS } from './ttsEngine.js';
import TTSProgressBar from './ttsProgressBar.js';

/**
 * 高级初始化方法：自动关联进度条组件进行加载。
 *
 * @param {Object} options - 初始化配置
 * @param {Object} [options.i18n] - i18n 实例，绑定后可直接传入 key 播报
 * @param {string} [options.locale] - 当前语言（如 'ja', 'zh-CN'），如果不绑定 i18n
 * @param {string} [options.model] - piper-plus 模型，默认 'css10' (多语言)
 * @param {boolean} [options.showProgressBar] - 是否显示进度条，默认 true
 * @param {HTMLElement} [options.progressBarContainer] - 进度条挂载容器，默认 document.body
 * @param {Function} [options.onProgress] - 原始进度回调
 * @param {Function} [options.onStatusChange] - 状态变更回调
 * @param {Function} [options.onError] - 错误回调
 * @returns {Promise<TTSEngine>} 返回初始化完成的 ttsEngine 实例
 */
export async function initializeTTS(options = {}) {
  const showBar = options.showProgressBar !== false;
  let progressBar = null;

  if (showBar) {
    // 解析当前 locale
    let currentLocale = options.locale || 'ja';
    if (options.i18n) {
      // 尝试从 i18n 实例获取当前语言
      const i18n = options.i18n;
      if (i18n.global && i18n.global.locale) {
        currentLocale = typeof i18n.global.locale === 'object'
          ? i18n.global.locale.value
          : i18n.global.locale;
      } else if (i18n.locale) {
        currentLocale = i18n.locale;
      } else if (i18n.language) {
        currentLocale = i18n.language;
      }
    }

    // 转换为进度条支持的语言 ('ja'|'zh'|'en')
    let barLocale = 'ja';
    const short = currentLocale.split('-')[0].split('_')[0].toLowerCase();
    if (['zh', 'cn'].includes(short)) barLocale = 'zh';
    else if (['en'].includes(short)) barLocale = 'en';

    progressBar = new TTSProgressBar({
      locale: barLocale,
      container: options.progressBarContainer,
    });
    progressBar.show();
  }

  // 包装进度回调
  const wrappedOnProgress = (data) => {
    if (progressBar) {
      progressBar.update(data);
    }
    if (options.onProgress) {
      options.onProgress(data);
    }
  };

  // 包装错误回调
  const wrappedOnError = (error) => {
    if (progressBar) {
      progressBar.showError(error.message);
    }
    if (options.onError) {
      options.onError(error);
    }
  };

  try {
    // 绑定 i18n 并初始化核心引擎
    await ttsEngine.init({
      i18n: options.i18n,
      locale: options.locale,
      model: options.model,
      onProgress: wrappedOnProgress,
      onStatusChange: options.onStatusChange,
      onError: wrappedOnError,
    });

    return ttsEngine;
  } catch (error) {
    if (progressBar) {
      progressBar.showError(error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export {
  ttsEngine,
  TTSEngine,
  TTSProgressBar,
  TTS_STATUS,
};

export default ttsEngine;
