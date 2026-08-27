module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // 防止硬编码颜色/字号回潮——设计值应该走 src/theme 的 token。
    // 先挂 warn，等 npm run audit:hardcoded 的一档清零后再提到 error。
    'react-native/no-color-literals': 'warn',
    'react-native/no-inline-styles': 'warn',
  },
};
