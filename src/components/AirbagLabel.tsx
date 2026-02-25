import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';
import type { AirbagZone } from '../types';

interface AirbagLabelProps {
  zone: AirbagZone;
  label: string;
  isActive: boolean;
  onPress: (zone: AirbagZone) => void;
  /** 连接线方向 */
  lineDirection: 'left' | 'right';
}

/**
 * 气囊图标（简化版）
 */
const AirbagIcon: React.FC<{ zone: AirbagZone; active: boolean }> = ({
  zone,
  active,
}) => {
  const color = active ? Colors.textWhite : Colors.textGray;

  // 根据不同气囊区域显示不同的简化图标
  const getIconContent = () => {
    switch (zone) {
      case 'shoulder':
        return (
          <View style={iconStyles.iconBox}>
            <View style={[iconStyles.shoulderLine, { backgroundColor: color }]} />
            <View style={[iconStyles.shoulderDot, { backgroundColor: color }]} />
          </View>
        );
      case 'lumbar':
        return (
          <View style={iconStyles.iconBox}>
            <View style={[iconStyles.waveLine, { borderColor: color }]} />
          </View>
        );
      case 'sideWing':
        return (
          <View style={iconStyles.iconBox}>
            <View style={[iconStyles.wingLeft, { borderColor: color }]} />
            <View style={[iconStyles.wingRight, { borderColor: color }]} />
          </View>
        );
      case 'hipFirmness':
        return (
          <View style={iconStyles.iconBox}>
            <View style={[iconStyles.hipDot, { backgroundColor: color }]} />
            <View style={[iconStyles.hipDot, { backgroundColor: color }]} />
          </View>
        );
      case 'legRest':
        return (
          <View style={iconStyles.iconBox}>
            <View style={[iconStyles.legLine, { backgroundColor: color }]} />
          </View>
        );
      default:
        return null;
    }
  };

  return <View style={iconStyles.container}>{getIconContent()}</View>;
};

const iconStyles = StyleSheet.create({
  container: {
    width: 24,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  shoulderLine: {
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  shoulderDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  waveLine: {
    width: 16,
    height: 8,
    borderWidth: 1.5,
    borderRadius: 4,
  },
  wingLeft: {
    width: 8,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 4,
    borderRightWidth: 0,
  },
  wingRight: {
    width: 8,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 4,
    borderLeftWidth: 0,
  },
  hipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  legLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
});

const AirbagLabel: React.FC<AirbagLabelProps> = ({
  zone,
  label,
  isActive,
  onPress,
  lineDirection,
}) => {
  return (
    <View
      style={[
        styles.wrapper,
        lineDirection === 'right' && styles.wrapperRight,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.container,
          isActive ? styles.activeContainer : styles.inactiveContainer,
        ]}
        onPress={() => onPress(zone)}
        activeOpacity={0.7}
      >
        <AirbagIcon zone={zone} active={isActive} />
        <Text
          style={[
            styles.label,
            isActive ? styles.activeLabel : styles.inactiveLabel,
          ]}
        >
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
