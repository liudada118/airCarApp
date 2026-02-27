import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

interface SavingModalProps {
  visible: boolean;
  onCancel: () => void;
}

/**
 * 旋转加载指示器
 */
const LoadingSpinner: React.FC = () => {
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={spinnerStyles.container}>
      <Animated.View
        style={[spinnerStyles.spinner, {transform: [{rotate}]}]}>
        {[...Array(8)].map((_, i) => {
          const angle = (i * 45 * Math.PI) / 180;
          const x = Math.cos(angle) * 14;
          const y = Math.sin(angle) * 14;
          const opacity = 0.15 + (i / 8) * 0.85;
          return (
            <View
              key={i}
              style={[
                spinnerStyles.dot,
                {
                  left: 16 + x - 3,
                  top: 16 + y - 3,
                  opacity,
                  backgroundColor: Colors.primary,
                },
              ]}
            />
          );
        })}
      </Animated.View>
    </View>
  );
};

const spinnerStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  spinner: {
    width: 36,
    height: 36,
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

const SavingModal: React.FC<SavingModalProps> = ({visible, onCancel}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <LoadingSpinner />
          <Text style={styles.message}>
            正在保存座椅气囊调节参数。请保持舒适坐姿、背部贴合座椅，约 5
            秒即可完成。
          </Text>
          <TouchableOpacity onPress={onCancel} activeOpacity={0.7}>
            <Text style={styles.cancelText}>取消保存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: Math.min(SCREEN_WIDTH * 0.4, 380),
    backgroundColor: Colors.modalBackground,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xxxl,
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },
  message: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  cancelText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});

export default SavingModal;
