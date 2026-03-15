import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'success' | 'info' | 'error';
  duration?: number;
  onHide?: () => void;
}

/**
 * 勾选图标（纯 View 实现）
 */
const CheckIcon: React.FC<{color: string}> = ({color}) => (
  <View style={[checkStyles.circle, {backgroundColor: color}]}>
    <View style={checkStyles.checkmark}>
      <View style={[checkStyles.checkShort, {backgroundColor: '#FFFFFF'}]} />
      <View style={[checkStyles.checkLong, {backgroundColor: '#FFFFFF'}]} />
    </View>
  </View>
);

const checkStyles = StyleSheet.create({
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    width: 12,
    height: 10,
    position: 'relative',
  },
  checkShort: {
    position: 'absolute',
    width: 2,
    height: 6,
    borderRadius: 1,
    bottom: 0,
    left: 2,
    transform: [{rotate: '-45deg'}],
  },
  checkLong: {
    position: 'absolute',
    width: 2,
    height: 10,
    borderRadius: 1,
    bottom: 0,
    left: 6,
    transform: [{rotate: '20deg'}],
  },
});

const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'success',
  duration = 3000,
  onHide,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // 用 ref 保存 onHide 回调，避免内联函数引用变化导致 useEffect 反复重置 timer
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  useEffect(() => {
    if (visible) {
      // 重置动画值
      translateY.setValue(-100);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onHideRef.current?.();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, translateY, opacity]);

  if (!visible) {
    return null;
  }

  // 设计稿：success 用绿色勾选，info 用蓝色勾选
  const iconColor =
    type === 'success'
      ? Colors.success
      : type === 'error'
      ? Colors.error
      : Colors.primary;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{translateY}],
          opacity,
        },
      ]}>
      <View style={styles.content}>
        <CheckIcon color={iconColor} />
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <TouchableOpacity
          onPress={onHide}
          activeOpacity={0.7}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <View style={styles.closeIcon}>
            <View style={[styles.closeLine, styles.closeLine1]} />
            <View style={[styles.closeLine, styles.closeLine2]} />
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.toastBackground,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: SCREEN_WIDTH * 0.6,
    gap: Spacing.sm,
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.toastText,
    flexShrink: 1,
  },
  closeIcon: {
    width: 12,
    height: 12,
    position: 'relative',
    marginLeft: Spacing.sm,
  },
  closeLine: {
    position: 'absolute',
    width: 12,
    height: 1.5,
    backgroundColor: Colors.textGray,
    top: 5,
    left: 0,
  },
  closeLine1: {
    transform: [{rotate: '45deg'}],
  },
  closeLine2: {
    transform: [{rotate: '-45deg'}],
  },
});

export default Toast;
