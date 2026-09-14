// 坐垫 6行×8列(48点) 预压力「分四块手动设置」的公用换算。
//
// 坐垫一维数组是「列优先」：idx = row + col*行数(6)，row∈[0,5]、col∈[0,7]。
// 显示上(AirbagHeatmap 未翻转)：row 0=最上、col 0=最左。
// 按行分上/下(row<3=上)、按列分左/右(col<4=左)，共 4 块，每块 3行×4列=12 格：
//   0=左上  1=右上  2=左下  3=右下
//
// CarAirRN(减压力) 和 HomeScreen(设置/预览) 都用这里的换算，避免两边对不上。

export const CUSHION_ROWS = 6;
export const CUSHION_COLS = 8;
export const CUSHION_LEN = 48;

// 4 块的标签与存储顺序：[左上, 右上, 左下, 右下]
export const CUSHION_QUAD_LABELS = ['左上', '右上', '左下', '右下'];

/** 坐垫某点下标(0..47) → 属于哪一块(0左上 / 1右上 / 2左下 / 3右下) */
export function cushionQuadOf(idx) {
  const row = idx % CUSHION_ROWS; // 0..5
  const col = Math.floor(idx / CUSHION_ROWS); // 0..7
  const bottom = row >= CUSHION_ROWS / 2; // row>=3 → 下半
  const right = col >= CUSHION_COLS / 2; // col>=4 → 右半
  return (bottom ? 2 : 0) + (right ? 1 : 0);
}

/** 坐垫某点下标 → 该块要减的预压力值（quad = [左上,右上,左下,右下]） */
export function cushionPreValue(idx, quad) {
  return Number(quad?.[cushionQuadOf(idx)]) || 0;
}

/** 4 块的值 [左上,右上,左下,右下] → 48 点列优先数组(每格=所在块的值)，喂给预览热力图 */
export function cushionPreToGrid(quad) {
  const arr = new Array(CUSHION_LEN).fill(0);
  for (let i = 0; i < CUSHION_LEN; i += 1) {
    arr[i] = cushionPreValue(i, quad);
  }
  return arr;
}
