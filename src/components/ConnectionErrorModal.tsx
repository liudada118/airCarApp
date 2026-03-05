import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

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
        <View style={styles.container}>
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
    fontSize: FontSize.lg,
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
