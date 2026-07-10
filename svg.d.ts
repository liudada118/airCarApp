// 让 TypeScript 认识 `import X from './x.svg'`(react-native-svg-transformer 把 svg 变成组件)
declare module '*.svg' {
  import React from 'react';
  import {SvgProps} from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
