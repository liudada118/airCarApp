import React from 'react';
import {View, Text, Image, Modal, TouchableOpacity, StyleSheet} from 'react-native';
import {Colors, FontSize, Spacing} from '../theme';
import ModalCard from './ModalCard';

// 顶部徽标图标(用 ASCII 文件名规避 Metro 中文路径坑)
const iconProtect = require('../assets/images/protect.png');

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
    <Image source={iconProtect} style={styles.badgeIcon} resizeMode="contain" />
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
    borderRadius: 28, // 圆圈(=宽高一半)
    backgroundColor: '#DFEEFF', // 圆圈颜色
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  badgeIcon: {
    width: 32,
    height: 32,
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
