import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme';
import IconFont from './IconFont';

interface AdjustButtonsProps {
  onIncrease: () => void;
  onDecrease: () => void;
  canIncrease: boolean;
  canDecrease: boolean;
  disabled?: boolean;
}

// 蓝色线性渐变(与标签/保存按钮统一)
const BLUE_GRAD = ['#559BEA', '#2978CE'] as const;

const AdjustButtons: React.FC<AdjustButtonsProps> = ({
  onIncrease,
  onDecrease,
  canIncrease,
  canDecrease,
  disabled = false,
}) => {
  const increaseEnabled = canIncrease && !disabled;
  const decreaseEnabled = canDecrease && !disabled;

  return (
    // 竖着的灰色圆角底槽 #252b35(常驻)
    <View style={styles.container}>
      {/* + 按钮:蓝色渐变圆角方 + 柔光;禁用=灰方 */}
      <TouchableOpacity
        onPress={onIncrease}
        disabled={!increaseEnabled}
        activeOpacity={0.8}
        style={styles.slot}>
        {increaseEnabled && <View style={styles.glow} pointerEvents="none" />}
        {increaseEnabled ? (
          <LinearGradient
            colors={BLUE_GRAD}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, styles.buttonLit]}>
            <IconFont name="plus-full" size={40} color={Colors.textWhite} />
          </LinearGradient>
        ) : (
          <View style={[styles.button, styles.disabledButton]}>
            <IconFont name="plus-full" size={30} color={Colors.textGray} />
          </View>
        )}
      </TouchableOpacity>

      {/* − 按钮:启用=蓝色渐变圆角方 + 柔光(与 + 一致);禁用=灰方 */}
      <TouchableOpacity
        onPress={onDecrease}
        disabled={!decreaseEnabled}
        activeOpacity={0.8}
        style={styles.slot}>
        {decreaseEnabled && <View style={styles.glow} pointerEvents="none" />}
        {decreaseEnabled ? (
          <LinearGradient
            colors={BLUE_GRAD}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, styles.buttonLit]}>
            <IconFont name="minus-full" size={40} color={Colors.textWhite} />
          </LinearGradient>
        ) : (
          <View style={[styles.button, styles.disabledButton]}>
            <IconFont name="minus-full" size={30} color={Colors.textGray} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const BTN = 84;
const RADIUS = 22; // 圆角方(不是圆)

const styles = StyleSheet.create({
  container: {
    // 竖着的灰色底槽
    backgroundColor: '#252b35',
    borderRadius: 26,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 20,
    alignItems: 'center',
  },
  slot: {
    width: BTN,
    height: BTN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: BTN,
    height: BTN,
    borderRadius: RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // + 亮态:蓝色柔光(Android 12+ 支持彩色阴影)
  buttonLit: {
    shadowColor: '#4E9BEE',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  // 柔光兜底层(阴影渲染不出时也有一圈halo)
  glow: {
    position: 'absolute',
    width: BTN + 14,
    height: BTN + 14,
    borderRadius: RADIUS + 8,
    backgroundColor: 'rgba(78, 155, 238, 0.28)',
  },
  disabledButton: {
    backgroundColor: '#3A4250',
  },
});

export default React.memo(AdjustButtons);
