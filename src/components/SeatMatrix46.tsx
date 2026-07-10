import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

/**
 * 46 点传感器矩阵显示（单块：坐垫 或 靠背）
 *
 * 布局（对应真实板子 46 点几何）：
 *   ┌────┬──────────────┬────┐
 *   │左翼│  主传感区域   │右翼│
 *   │ 5  │   6 × 6 = 36  │ 5  │   → 合计 46
 *   └────┴──────────────┴────┘
 *
 * data 约定（46 个数）：
 *   [0..35]  主传感区域，按“行优先”排列（第0行左→右，再第1行…共6行6列）
 *   [36..40] 左翼，从上到下 5 个
 *   [41..45] 右翼，从上到下 5 个
 *
 * ⚠️ 点位对应（哪个物理点落在哪个格子）尚未确认，这里只负责“把 46 个块按布局画出来”。
 */

const CENTER_COLS = 6;
const CENTER_ROWS = 6;
const WING_COUNT = 5;

/** 单格背景色：蓝→青→绿→黄→红（与原矩阵一致） */
function cellColor(val: number): string {
  if (val <= 0) return '#1a1a2e';
  const t = Math.min(val / 255, 1);
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

interface Props {
  /** 至少 46 个数；不足的按 0 处理 */
  data: number[];
  /** 标题，如 “坐垫” / “靠背” */
  title: string;
}

const SeatMatrix46: React.FC<Props> = ({data, title}) => {
  const at = (i: number) => (Number.isFinite(data?.[i]) ? data[i] : 0);
  const center = Array.from({length: CENTER_ROWS * CENTER_COLS}, (_, i) => at(i));
  const left = Array.from({length: WING_COUNT}, (_, i) => at(36 + i));
  const right = Array.from({length: WING_COUNT}, (_, i) => at(41 + i));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}（46 点）</Text>
      <View style={styles.body}>
        {/* 左翼：竖排 5 */}
        <View style={styles.wingCol}>
          <Text style={styles.regionLabel}>左翼</Text>
          {left.map((v, i) => (
            <Cell key={`l${i}`} val={v} />
          ))}
        </View>

        {/* 主传感区域：6×6 */}
        <View style={styles.centerCol}>
          <Text style={styles.regionLabel}>主传感区域</Text>
          {Array.from({length: CENTER_ROWS}, (_, row) => (
            <View key={`row${row}`} style={styles.centerRow}>
              {Array.from({length: CENTER_COLS}, (_, col) => (
                <Cell key={`c${row}-${col}`} val={center[row * CENTER_COLS + col]} />
              ))}
            </View>
          ))}
        </View>

        {/* 右翼：竖排 5 */}
        <View style={styles.wingCol}>
          <Text style={styles.regionLabel}>右翼</Text>
          {right.map((v, i) => (
            <Cell key={`r${i}`} val={v} />
          ))}
        </View>
      </View>
    </View>
  );
};

/** 底部压力色谱图例（横向渐变条 + 刻度） */
export const PressureLegend: React.FC = () => {
  const segments = Array.from({length: 40}, (_, i) => cellColor((i / 39) * 255));
  return (
    <View style={styles.legendWrap}>
      <Text style={styles.legendTitle}>压力色谱</Text>
      <View style={styles.legendBar}>
        {segments.map((c, i) => (
          <View key={i} style={{flex: 1, backgroundColor: c}} />
        ))}
      </View>
      <View style={styles.legendScale}>
        <Text style={styles.legendScaleText}>无压力</Text>
        <Text style={styles.legendScaleText}>最大压力</Text>
      </View>
    </View>
  );
};

const CELL_W = 40;
const CELL_H = 30;
const CELL_GAP = 4;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginHorizontal: 12,
  },
  title: {
    fontSize: 12,
    color: '#7cc4ff',
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  // 侧翼列：竖排，顶部与主区第一行对齐（标签占位后再排格子）
  wingCol: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  centerCol: {
    alignItems: 'center',
  },
  centerRow: {
    flexDirection: 'row',
    gap: CELL_GAP,
    marginBottom: CELL_GAP,
  },
  regionLabel: {
    fontSize: 10,
    color: '#6a8aaa',
    marginBottom: 6,
    height: 14,
  },
  cell: {
    width: CELL_W,
    height: CELL_H,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: CELL_GAP,
  },
  cellText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  // ─── 图例 ───
  legendWrap: {
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legendTitle: {
    fontSize: 10,
    color: '#6a8aaa',
    marginBottom: 4,
  },
  legendBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 3,
    overflow: 'hidden',
  },
  legendScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  legendScaleText: {
    fontSize: 9,
    color: '#6a8aaa',
  },
});

export default SeatMatrix46;
