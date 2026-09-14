const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // 限制转换/压缩阶段的并行 worker 数：本机内存偏紧，默认按 CPU 核数起池会把
  // 内存吃爆（Metro worker 崩溃 / Gradle daemon OOM）。压到 2 个足够稳。
  maxWorkers: 2,
  transformer: {
    // 让 .svg 文件经 react-native-svg-transformer 变成可 import 的 React 组件
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  //debug
  resolver: {
    // Gradle/Chaquopy removes and recreates these directories while building.
    // Ignoring them prevents Metro's file watcher from exiting with ENOENT.
    blockList: [
      /[/\\]android[/\\]app[/\\]build[/\\].*/,
      /[/\\]android[/\\]build[/\\].*/,
    ],
    // glb 仍作为二进制资源；svg 从 assetExts 移到 sourceExts(改由 transformer 处理)
    assetExts: [
      ...defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg'),
      'glb',
    ],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
