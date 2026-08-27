/**
 * 主题入口。三层合并，后者压过前者：
 *
 *   colors.ts / spacing.ts   基线值（同步前的手写主题，也是同步不到时的兜底）
 *   generated/               MasterGo 样式库同步下来的值 ← 设计说了算
 *   overrides.ts             手工临时覆盖
 *
 * 对外导出的名字（Colors / FontSize / Spacing / BorderRadius）保持不变，
 * 已经在用主题的组件一行都不用改。
 */
import {Colors as BaseColors} from './colors';
import {Spacing as BaseSpacing, FontSize as BaseFontSize, BorderRadius as BaseBorderRadius} from './spacing';
import {
  GeneratedColors,
  GeneratedGradients,
  GeneratedTypography,
  GeneratedFontSize,
  GeneratedShadows,
  GeneratedRadius,
  GeneratedSpacing,
} from './generated';
import {DebugColors, ColorOverrides, FontSizeOverrides} from './overrides';

export const Colors = {
  ...BaseColors,
  ...GeneratedColors,
  ...ColorOverrides,
};

export const FontSize = {
  ...BaseFontSize,
  ...GeneratedFontSize,
  ...FontSizeOverrides,
};

/**
 * 生成的间距/圆角 key 是 `s12` / `r8` 这种带值的形式，不会和手写的 sm/md/lg 撞名。
 * 想把某个采样值提升成语义名，去 design/token-map.json 里显式映射。
 */
export const Spacing = {
  ...BaseSpacing,
  ...GeneratedSpacing,
};

export const BorderRadius = {
  ...BaseBorderRadius,
  ...GeneratedRadius,
};

/** 渐变，直接摊给 expo-linear-gradient：<LinearGradient {...Gradients.xxx} /> */
export const Gradients = GeneratedGradients;

/** 成套的文字样式（字号 + 行高 + 字重） */
export const Typography = GeneratedTypography;

/** 阴影，摊进 View 的 style */
export const Shadows = GeneratedShadows;

export {DebugColors};
