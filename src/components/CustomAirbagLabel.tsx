import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, ImageSourcePropType} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import type {CustomAirbagZone} from '../types';

/**
 * 自定义气囊区域对应的 icon 图片映射（5 组）
 */
const ZONE_ICON_MAP: Record<CustomAirbagZone, ImageSourcePropType> = {
  shoulder: require('../assets/icons/icon-shoulder.png'),
  sideWing: require('../assets/icons/icon-sideWing.png'),
  lumbar: require('../assets/icons/icon-waist.png'),
  hipFirm: require('../assets/icons/icon-hip.png'),
  legRest: require('../assets/icons/icon-legRest.png'),
};

// 蓝色线性渐变(默认底 / +号段)
const BLUE_GRAD = ['#559BEA', '#2978CE'] as const;
// 段总数(与 MAX_VALUE 一致)
const SEG_TOTAL = 3;
// 充气段=蓝 / 放气(附属)段=橘
const SEG_BLUE = '#4E9BEE';
const SEG_ORANGE = '#F0883E';
const SEG_EMPTY = 'rgba(255, 255, 255, 0.18)';

interface CustomAirbagLabelProps {
  zone: CustomAirbagZone;
  label: string;
  isActive: boolean;
  onPress: (zone: CustomAirbagZone) => void;
  /** 连接线方向 */
  lineDirection: 'left' | 'right';
  /** 累计操作次数（正数=充气次数=蓝段，负数=放气次数=橘段，0=无操作） */
  cmdCount?: number;
}

const CustomAirbagLabel: React.FC<CustomAirbagLabelProps> = ({
  zone,
  label,
  isActive,
  onPress,
  lineDirection,
  cmdCount = 0,
}) => {
  const iconSource = ZONE_ICON_MAP[zone];
  // 选中=白底 → icon/文字用深蓝;默认=蓝底 → icon/文字用白
  const fgColor = isActive ? '#2978CE' : Colors.textWhite;

  // 3 小段:填充数=|cmdCount|(封顶 3);正=蓝、负=橘
  const filled = Math.min(Math.abs(cmdCount), SEG_TOTAL);
  const segColor = cmdCount > 0 ? SEG_BLUE : cmdCount < 0 ? SEG_ORANGE : SEG_EMPTY;

  return (
    <View
      style={[
        styles.wrapper,
        lineDirection === 'right' && styles.wrapperRight,
      ]}>
      {/* 文字框 + 下面的 3 小段 */}
      <View style={styles.boxColumn}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => onPress(zone)}>
          {isActive ? (
            <View style={[styles.container, styles.activeContainer]}>
              <Image
                source={iconSource}
                style={[styles.icon, {tintColor: fgColor}]}
                resizeMode="contain"
              />
              <Text style={[styles.label, {color: fgColor}]}>{label}</Text>
            </View>
          ) : (
            <LinearGradient
              colors={BLUE_GRAD}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={styles.container}>
              <Image
                source={iconSource}
                style={[styles.icon, {tintColor: fgColor}]}
                resizeMode="contain"
              />
              <Text style={[styles.label, {color: fgColor}]}>{label}</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
        {/* 3 小段进度 */}
        <View style={styles.segRow}>
          {Array.from({length: SEG_TOTAL}).map((_, i) => (
            <View
              key={i}
              style={[
                styles.seg,
                {backgroundColor: i < filled ? segColor : SEG_EMPTY},
              ]}
            />
          ))}
        </View>
      </View>

      {/* 连接线 */}
      <View
        style={[
          styles.line,
          {backgroundColor: isActive ? '#2978CE' : 'rgba(150, 150, 170, 0.4)'},
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrapperRight: {
    flexDirection: 'row-reverse',
  },
  boxColumn: {
    alignItems: 'stretch',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  activeContainer: {
    backgroundColor: Colors.textWhite,
  },
  icon: {
    width: 22,
    height: 22,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  // 3 小段
  segRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  seg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  line: {
    width: 60,
    height: 2,
  },
});

export default React.memo(CustomAirbagLabel);
