import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {PressureLegend} from './SeatMatrix46';

/**
 * airbag_13Hz 算法输出的两张压力热力图。
 *
 *   靠背 backrestData[56] → 7 行 × 8 列
 *   坐垫 cushionData[48]  → 6 行 × 8 列
 *
 * 数据是 MATLAB「列优先」一维数组：矩阵 (row, col) 对应一维下标 = row + col*行数。
 * （即先填满第 1 列从上到下，再第 2 列……）
 *
 * ⚠️ 方向校准：矩阵的「行列」和座椅「上下/左右」的对应，取决于传感器物理安装，
 *    算法代码里看不出来。若发现图上下颠倒 / 左右反了，改下面 4 个开关即可（都在本文件顶部）。
 */

// ─── 方向校准开关（需要调方向就改这里）───────────────────────────
const FLIP_VERTICAL = false; // true = 上下翻转（第1行变最后一行）
const FLIP_HORIZONTAL = false; // true = 左右翻转（第1列变最后一列）
// ────────────────────────────────────────────────────────────────

// 颜色映射的「满量程」。传感器原始值 0~255；若空座偏暗、想让颜色更明显，可调小（如 120）。
const MAX_VAL = 255;

/** 单格背景色：蓝→青→绿→黄→红（与系统原矩阵一致） */
function cellColor(val: number): string {
  if (val <= 0) return '#1a1a2e';
  const t = Math.min(val / MAX_VAL, 1);
  const stops = [
    {p: 0.0, r: 0, g: 0, b: 80},
    {p: 0.25, r: 0, g: 100, b: 200},
    {p: 0.5, r: 0, g: 200, b: 100},
    {p: 0.75, r: 220, g: 200, b: 0},
    {p: 1.0, r: 255, g: 50, b: 20},
  ];
  let i = 0;
  for (i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].p) break;
  }
  const s0 = stops[i];
  const s1 = stops[Math.min(i + 1, stops.length - 1)];
  const f = s1.p === s0.p ? 0 : (t - s0.p) / (s1.p - s0.p);
  const r = Math.round(s0.r + (s1.r - s0.r) * f);
  const g = Math.round(s0.g + (s1.g - s0.g) * f);
  const b = Math.round(s0.b + (s1.b - s0.b) * f);
  return `rgb(${r},${g},${b})`;
}

function Cell({val}: {val: number}) {
  return (
    <View style={[styles.cell, {backgroundColor: cellColor(val)}]}>
      <Text style={styles.cellText}>{val > 0 ? Math.round(val) : ''}</Text>
    </View>
  );
}

/** 把列优先一维数组画成 rows×cols 的网格 */
function Grid({
  data,
  rows,
  cols,
  title,
}: {
  data: number[];
  rows: number;
  cols: number;
  title: string;
}) {
  const at = (row: number, col: number) => {
    const r = FLIP_VERTICAL ? rows - 1 - row : row;
    const c = FLIP_HORIZONTAL ? cols - 1 - col : col;
    const idx = r + c * rows; // 列优先下标
    const v = data?.[idx];
    return Number.isFinite(v) ? v : 0;
  };
  return (
    <View style={styles.gridWrap}>
      <Text style={styles.title}>
        {title}（{rows}×{cols}）
      </Text>
      {Array.from({length: rows}, (_, row) => (
        <View key={`row${row}`} style={styles.gridRow}>
          {Array.from({length: cols}, (_, col) => (
            <Cell key={`c${row}-${col}`} val={at(row, col)} />
          ))}
        </View>
      ))}
    </View>
  );
}

interface Props {
  /** 坐垫 48 点（列优先，恢复 6×8）。不足按 0 处理 */
  cushion: number[];
  /** 靠背 56 点（列优先，恢复 7×8）。不足按 0 处理 */
  backrest: number[];
}

const AirbagHeatmap: React.FC<Props> = ({cushion, backrest}) => {
  return (
    <View style={styles.container}>
      <View style={styles.grids}>
        <Grid data={backrest} rows={7} cols={8} title="靠背" />
        <Grid data={cushion} rows={6} cols={8} title="坐垫" />
      </View>
      <PressureLegend />
    </View>
  );
};

const CELL_W = 34;
const CELL_H = 26;
const CELL_GAP = 4;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  grids: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 24,
  },
  gridWrap: {
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    color: '#7cc4ff',
    fontWeight: '600',
    marginBottom: 8,
  },
  gridRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  cell: {
    width: CELL_W,
    height: CELL_H,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
});

export default AirbagHeatmap;
