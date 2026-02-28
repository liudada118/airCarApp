import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import IconFont from './IconFont';
import type {AirbagZone} from '../types';

/**
 * 气囊区域对应的 iconfont 图标名称映射
 */
const ZONE_ICON_MAP: Record<AirbagZone, string> = {
  shoulderL: 'a-zu1175',
  shoulderR: 'a-zu1175',
  sideWingL: 'a-zu1216',
  sideWingR: 'a-zu1216',
  lumbarUp: 'a-zu1202',
  lumbarDown: 'a-zu1202',
  cushionFL: 'zu',
  cushionFR: 'zu',
  cushionRL: 'a-zu1215',
  cushionRR: 'a-zu1215',
};

interface AirbagLabelProps {
  zone: AirbagZone;
  label: string;
  isActive: boolean;
  onPress: (zone: AirbagZone) => void;
  /** 连接线方向 */
  lineDirection: 'left' | 'right';
}

const AirbagLabel: React.FC<AirbagLabelProps> = ({
  zone,
  label,
  isActive,
  onPress,
  lineDirection,
}) => {
  const iconName = ZONE_ICON_MAP[zone];
  const iconColor = isActive ? Colors.textWhite : Colors.textGray;

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
        <IconFont name={iconName} size={18} color={iconColor} />
        <Text
          style={[
            styles.label,
            isActive ? styles.activeLabel : styles.inactiveLabel,
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  activeContainer: {
    backgroundColor: Colors.primary,
  },
  inactiveContainer: {
    backgroundColor: 'rgba(100, 100, 120, 0.4)',
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  activeLabel: {
    color: Colors.textWhite,
  },
  inactiveLabel: {
    color: Colors.textGray,
  },
  line: {
    width: 40,
    height: 1.5,
  },
});

export default AirbagLabel;
