import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {
  AirbagFullFrame,
  SCALAR_SECTIONS,
  REASON_CODE_LABELS,
  STATUS_CODE_LABELS,
  AIRBAG_ID_NAMES,
  gearLabel,
  formatFieldValue,
} from '../utils/airbagFullFrame';

interface Props {
  visible: boolean;
  onClose: () => void;
  frame: AirbagFullFrame | null;
  /** 已累计收到的帧数 */
  frameCount: number;
  /** 实测帧率（帧/秒） */
  fps: number;
}

/** 单个数值单元格的背景色（按数值 0~1 归一化，仅用于坐垫/靠背热力显示） */
function cellColor(val: number, max: number): string {
  if (!(val > 0) || max <= 0) return '#1a1a2e';
  const t = Math.min(val / max, 1);
  const r = Math.round(30 + t * 225);
  const g = Math.round(60 + t * 60);
  const b = Math.round(120 - t * 100);
  return `rgb(${r},${g},${b})`;
}

function Grid({data, label}: {data: number[]; label: string}) {
  const max = data.reduce((m, v) => (v > m ? v : m), 0);
  return (
    <View style={styles.gridBlock}>
      <Text style={styles.gridLabel}>
        {label}（10×6，峰值 {max.toFixed(0)}）
      </Text>
      <View>
        {Array.from({length: 10}, (_, row) => (
          <View key={`r${row}`} style={styles.gridRow}>
            {Array.from({length: 6}, (_, col) => {
              const v = data[row * 6 + col] ?? 0;
              return (
                <View
                  key={`c${row}-${col}`}
                  style={[styles.gridCell, {backgroundColor: cellColor(v, max)}]}>
                  <Text style={styles.gridCellText}>{v.toFixed(0)}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const AirbagFullFrameModal: React.FC<Props> = ({
  visible,
  onClose,
  frame,
  frameCount,
  fps,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={{flex: 1}}>
              <Text style={styles.title}>板子数据帧 (1376B / 343×float32)</Text>
              <Text style={styles.subtitle}>
                {frameCount > 0
                  ? `已收到 ${frameCount} 帧 · 实测 ${fps} 帧/秒 · 帧尾 AA 55 03 99`
                  : '等待数据…（确认板子已插好、已连接）'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {!frame ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无数据</Text>
              <Text style={styles.emptyHint}>
                收到第一帧后，这里会实时显示全部字段（约每秒刷新几次）
              </Text>
            </View>
          ) : (
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator>
              {/* ─── 压力数据 ─── */}
              <Text style={styles.sectionTitle}>压力数据（处理后）</Text>
              <View style={styles.gridRowWrap}>
                <Grid data={frame.cushionData} label="坐垫" />
                <Grid data={frame.backrestData} label="靠背" />
              </View>

              {/* ─── 标量分组 ─── */}
              {SCALAR_SECTIONS.map(section => (
                <View key={section.title}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  {section.fields.map(field => {
                    const raw = frame.scalars[field.key];
                    let extra = '';
                    if (field.key === 'reasonCode') {
                      extra = REASON_CODE_LABELS[Math.round(raw)] ?? '';
                    } else if (field.key === 'statusCode') {
                      extra = STATUS_CODE_LABELS[Math.round(raw)] ?? '';
                    }
                    return (
                      <View key={field.key} style={styles.row}>
                        <View style={{flex: 1}}>
                          <Text style={styles.rowKey}>{field.label}</Text>
                          {field.note ? (
                            <Text style={styles.rowNote}>{field.note}</Text>
                          ) : null}
                        </View>
                        <Text style={styles.rowValue}>
                          {formatFieldValue(raw, field.kind)}
                          {extra ? `  ${extra}` : ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}

              {/* ─── 气囊协议帧 ─── */}
              <Text style={styles.sectionTitle}>
                气囊协议帧 frame[55]（帧头 {frame.airbagHeader}）
              </Text>
              {frame.airbagDecoded.map(ab => {
                const name = AIRBAG_ID_NAMES[ab.id] ?? `预留${ab.id}`;
                const color =
                  ab.gear === 3
                    ? Colors.primary
                    : ab.gear === 4
                    ? Colors.warning
                    : Colors.textGray;
                return (
                  <View key={ab.index} style={styles.row}>
                    <View style={{flex: 1}}>
                      <Text style={styles.rowKey}>
                        {ab.index}. 编号{ab.id} {name}
                      </Text>
                    </View>
                    <Text style={[styles.rowValue, {color}]}>
                      {gearLabel(ab.gear)}
                    </Text>
                  </View>
                );
              })}
              <View style={styles.row}>
                <View style={{flex: 1}}>
                  <Text style={styles.rowKey}>帧尾（应为 170,85,3,153）</Text>
                </View>
                <Text style={styles.rowValue}>{frame.airbagTail.join(', ')}</Text>
              </View>

              {/* ─── 输入120点回显 ─── */}
              <Text style={styles.sectionTitle}>输入 120 点回显 frame_data_out[120]</Text>
              <Text style={styles.mono} selectable>
                {frame.frameDataOut.map(v => v.toFixed(0)).join(', ')}
              </Text>

              <View style={{height: 24}} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    width: '90%',
    maxWidth: 760,
    // 用确定高度，保证内部 flex:1 的 ScrollView 有可用高度（否则会塌缩成 0）
    height: '86%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: Colors.textGray,
    fontWeight: '600',
  },
  empty: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textGray,
    fontSize: FontSize.md,
  },
  emptyHint: {
    color: Colors.textGray,
    fontSize: FontSize.xs,
    marginTop: 8,
    textAlign: 'center',
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  rowKey: {
    fontSize: 13,
    color: '#E0E0E0',
    fontWeight: '500',
  },
  rowNote: {
    fontSize: 11,
    color: '#90A4AE',
    marginTop: 2,
  },
  rowValue: {
    fontSize: 13,
    color: '#B0BEC5',
    fontWeight: '600',
    maxWidth: 180,
    textAlign: 'right',
  },
  gridRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridBlock: {
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: 11,
    color: Colors.textGray,
    marginBottom: 3,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 1,
    marginBottom: 1,
  },
  gridCell: {
    width: 22,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 1,
  },
  gridCellText: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.8)',
  },
  mono: {
    fontSize: 10,
    color: '#B0BEC5',
    fontFamily: 'monospace',
    lineHeight: 15,
    paddingHorizontal: 4,
  },
});

export default AirbagFullFrameModal;
