// react-native-svg-transformer 会读取本配置(经 @svgr/core）。
// 关键:保留 <defs> 里的 radialGradient 定义和它们的 id，
// 否则 svgo 默认会当作"未使用"删掉,导致圆点/发光块的 fill:url(#渐变) 落空、渲染成黑块。
module.exports = {
  native: true,
  svgoConfig: {
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            inlineStyles: {onlyMatchedOnce: false}, // 把 <style> 里的类填充内联到元素
            removeViewBox: false,
            removeUnknownsAndDefaults: false,
            convertColors: false,
            cleanupIds: false, // 保留渐变 id(含中文 id)
            removeUselessDefs: false, // 保留 <defs> 里的渐变定义
            removeHiddenElems: false,
          },
        },
      },
    ],
  },
};
