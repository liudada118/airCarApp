/**
 * 矩侨工业 - 5×5传感矩阵线序映射
 *
 * 根据《数值矩阵-16列×16行.xlsx》中黄色标记的传感点位置，
 * 定义5×5传感器在256字节数据中的字节索引。
 *
 * Excel中的值本身即为0-based字节索引（第一行从0开始: 0,1,2,...,15）
 *
 * 5×5矩阵映射（黄色标记位置）:
 *   行0: 索引  6,  7,  8,  9, 10
 *   行1: 索引 22, 23, 24, 25, 26
 *   行2: 索引 214,215,216,217,218
 *   行3: 索引 230,231,232,233,234
 *   行4: 索引 246,247,248,249,250
 */

/** 5×5传感矩阵的显示维度 */
export const SENSOR_5X5_DIM = 5;

/** 5×5传感矩阵在256字节数据中的0-based字节索引（按行排列） */
export const SENSOR_5X5_INDICES: number[][] = [
  [6, 7, 8, 9, 10],         // 行0: Excel行1, 列7-11
  [22, 23, 24, 25, 26],     // 行1: Excel行2, 列7-11
  [214, 215, 216, 217, 218], // 行2: Excel行3, 列7-11
  [230, 231, 232, 233, 234], // 行3: Excel行4, 列7-11
  [246, 247, 248, 249, 250], // 行4: Excel行5, 列7-11
];

/** 将5×5索引展平为一维数组（共25个索引） */
export const SENSOR_5X5_FLAT: number[] = SENSOR_5X5_INDICES.flat();

/**
 * 从256字节原始数据中按线序映射提取5×5传感矩阵数据
 * @param raw256 - 256字节的16×16原始数据（两包合并: 128+128）
 * @returns 25个元素的一维数组（按行排列的5×5矩阵）
 */
export function extract5x5FromRaw256(raw256: number[]): number[] {
  const result: number[] = new Array(25);
  for (let i = 0; i < 25; i++) {
    const byteIndex = SENSOR_5X5_FLAT[i];
    result[i] = byteIndex < raw256.length ? raw256[byteIndex] : 0;
  }
  return result;
}
