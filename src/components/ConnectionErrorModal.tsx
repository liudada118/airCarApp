import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import ModalCard from './ModalCard';

interface ConnectionErrorModalProps {
  visible: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}

const ConnectionErrorModal: React.FC<ConnectionErrorModalProps> = ({
  visible,
  onDismiss,
  onRetry,
  retrying = false,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent>
      <View style={styles.overlay}>
        <ModalCard style={styles.container}>
          <Text style={styles.title}>连接异常，请检查设备</Text>
          <Text style={styles.description}>
            当前软件未能正常连接。请检查您的接线或硬件设备，确保一切连接正确后，点击重新连接。如有持续问题，请联系技术支持。
          </Text>
          <View style={styles.buttonGroup}>
            {onRetry && (
              <TouchableOpacity
                style={[styles.retryButton, retrying && styles.retryButtonDisabled]}
                onPress={onRetry}
                activeOpacity={0.7}
                disabled={retrying}>
                {retrying ? (
                  <View style={styles.retryingRow}>
                    <ActivityIndicator size="small" color={Colors.textWhite} />
                    <Text style={styles.retryButtonText}>连接中...</Text>
                  </View>
                ) : (
                  <Text style={styles.retryButtonText}>重新连接</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} disabled={retrying}>
              <Text style={[styles.linkText, retrying && styles.linkTextDisabled]}>我知道了</Text>
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
    // 尺寸/背景/垂直居中由 ModalCard 提供(固定长宽 440×300、圆角 24、背景图)。这里只给左右内边距。
    paddingHorizontal: 48,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.xxl,
  },
  buttonGroup: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xxxl,
    width: '100%',
    alignItems: 'center',
  },
  retryButtonDisabled: {
    backgroundColor: Colors.textGray,
  },
  retryButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  retryingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  linkText: {
    fontSize: FontSize.xl,
    fontWeight: '500',
    color: Colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  linkTextDisabled: {
    color: Colors.textGray,
  },
});

export default ConnectionErrorModal;
