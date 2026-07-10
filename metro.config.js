const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    // 让 .svg 文件经 react-native-svg-transformer 变成可 import 的 React 组件
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    // glb 仍作为二进制资源；svg 从 assetExts 移到 sourceExts(改由 transformer 处理)
    assetExts: [
      ...defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg'),
      'glb',
    ],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
