import React from 'react';
import {View, Text, Image, TouchableOpacity, StyleSheet, ImageSourcePropType} from 'react-native';
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

interface CustomAirbagLabelProps {
  zone: CustomAirbagZone;
  label: string;
  isActive: boolean;
  onPress: (zone: CustomAirbagZone) => void;
  /** 连接线方向 */
  lineDirection: 'left' | 'right';
  /** 累计操作次数（正数=充气次数，负数=放气次数，0=无操作） */
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
  const iconTintColor = isActive ? Colors.textWhite : Colors.textGray;

  // 格式化操作次数文本
  const countText =
    cmdCount > 0 ? `+${cmdCount}` : cmdCount < 0 ? `${cmdCount}` : '';
  const countColor =
    cmdCount > 0 ? '#58A6FF' : cmdCount < 0 ? '#F0883E' : Colors.textGray;

  return (
    <View
      style={[
        styles.wrapper,
        lineDirection === 'right' && styles.wrapperRight,
      ]}>
      <TouchableOpacity
        style={[
          styles.container,
          isActive ? styles.activeContainer : styles.inactiveContainer,
        ]}
        onPress={() => onPress(zone)}
        activeOpacity={0.7}>
        <Image
          source={iconSource}
          style={[styles.icon, {tintColor: iconTintColor}]}
          resizeMode="contain"
        />
        <Text
          style={[
            styles.label,
            isActive ? styles.activeLabel : styles.inactiveLabel,
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
      {/* 操作次数标记 */}
      {countText !== '' && (
        <Text style={[styles.countBadge, {color: countColor}]}>
          {countText}
        </Text>
      )}
      {/* 连接线 */}
      <View
        style={[
          styles.line,
          {
            backgroundColor: isActive
              ? Colors.primary
              : 'rgba(150, 150, 170, 0.4)',
          },
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
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  activeContainer: {
    backgroundColor: Colors.primary,
  },
  inactiveContainer: {
    backgroundColor: 'rgba(100, 100, 120, 0.4)',
  },
  icon: {
    width: 22,
    height: 22,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  activeLabel: {
    color: Colors.textWhite,
  },
  inactiveLabel: {
    color: Colors.textGray,
  },
  countBadge: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginHorizontal: 2,
    minWidth: 20,
    textAlign: 'center',
  },
  line: {
    width: 60,
    height: 2,
  },
});

export default React.memo(CustomAirbagLabel);
