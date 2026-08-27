/**
 * 手工层。这个文件不会被 `npm run sync:design` 覆盖。
 *
 * 两个用途：
 * 1. 放设计稿里根本没有、但代码需要的值（比如调试面板配色）；
 * 2. 临时压过 MasterGo 同步下来的值——加进 ColorOverrides / FontSizeOverrides 即可，
 *    优先级最高。属于临时手段，改完设计稿就该把它删掉。
 */

/**
 * 实时数据调试面板的状态色。
 * 这批颜色是给开发看数据用的（绿=正常 / 黄=进行中 / 红=异常），不是设计资产，
 * 所以刻意不进设计令牌管线——设计换主题时不该把调试面板一起换掉。
 */
export const DebugColors = {
  ok: '#4CAF50',
  pending: '#FFC107',
  error: '#FF5722',
  muted: '#999999',
} as const;

/** 临时压过生成的颜色值。填了就以这里为准。 */
export const ColorOverrides = {} as const;

/** 临时压过生成的字号。 */
export const FontSizeOverrides = {} as const;
