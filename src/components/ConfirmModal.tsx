import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {Colors, FontSize, Spacing} from '../theme';
import ModalCard from './ModalCard';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  description: string;
  cancelText: string;
  confirmText: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  title,
  description,
  cancelText,
  confirmText,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent>
      <View style={styles.overlay}>
        <ModalCard style={styles.container}>
          {/* 上半部分:标题+说明,在按钮条以上的剩余空间里垂直居中 */}
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          {/* 底部按钮条:横向分割线 + 左右两个文字按钮(中间竖分割线),贴住卡片底部通宽 */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={onCancel}
              activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <View style={styles.buttonDivider} />
            <TouchableOpacity
              style={styles.button}
              onPress={onConfirm}
              activeOpacity={0.7}>
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
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
    // 尺寸/背景由 ModalCard 提供(固定长宽 440×300、圆角 24、背景图)。
    // 按钮条要贴底通宽,所以容器不给内边距,左右内边距放在 content 上。
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  title: {
    fontSize: 22, // ← 标题「确认恢复默认参数?」字号,想再大/小改这里
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: 18, // ← 说明文字字号,想再大/小改这里
    color: Colors.textSecondary,
    lineHeight: 28, // 行距,跟着字号调(约字号×1.5)
  },
  // 底部按钮条:上横分割线,左右两半,中间竖分割线(参照设计图 iOS 风格)
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5, // ← 上面那条蓝横线的粗细
    borderTopColor: 'rgba(0, 114, 239, 0.45)',
  },
  button: {
    flex: 1,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDivider: {
    width: 2, // ← 中间竖线的粗细
    height: 50, // ← 竖线长度(按钮区高64,短于它→上下留空隙,不和横线相连)
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 114, 239, 0.45)',
    borderRadius: 2,
  },
  cancelButtonText: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: '#0072EF',
  },
  confirmButtonText: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: '#0072EF',
  },
});

export default ConfirmModal;
