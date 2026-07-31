import React from 'react';
import {View, Text, Modal, TouchableOpacity, StyleSheet} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {Colors, FontSize, Spacing} from '../theme';
import ModalCard from './ModalCard';

/**
 * 儿童/宠物安全保护弹窗。
 * 触发：算法 isChild 从 0→1（主驾区域检测到儿童或宠物）。
 * 模板与「连接异常」弹窗一致（ModalCard 440×300 + 标题 + 说明 + 我知道了），
 * 顶部多一个盾牌徽标。
 */
interface ChildSafetyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const ShieldBadge = () => (
  <View style={styles.badge}>
    <Svg width={30} height={30} viewBox="0 0 24 24">
      {/* 盾牌(白) */}
      <Path
        d="M12 2.5l7 2.6v5.4c0 4.7-3.1 8.3-7 9.5-3.9-1.2-7-4.8-7-9.5V5.1z"
        fill={Colors.textWhite}
      />
      {/* 对勾(蓝) */}
      <Path
        d="M8.5 12l2.3 2.3 4.7-4.7"
        stroke={Colors.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  </View>
);

const ChildSafetyModal: React.FC<ChildSafetyModalProps> = ({visible, onDismiss}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <ModalCard style={styles.container}>
          <ShieldBadge />
          <Text style={styles.title}>安全保护</Text>
          <Text style={styles.description}>
            检测到儿童或宠物位于主驾驶区域，安全保护已开启。请使用手机 App 或钥匙解锁车辆。
          </Text>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.linkText}>我知道了</Text>
          </TouchableOpacity>
        </ModalCard>
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
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  linkText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

export default ChildSafetyModal;
