import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

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
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={onConfirm}
              activeOpacity={0.7}>
              <Text style={styles.confirmButtonText}>{confirmText}</Text>
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.borderBlue,
  },
  confirmButton: {
    backgroundColor: Colors.buttonBlue,
  },
  cancelButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.primary,
  },
  confirmButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.textWhite,
  },
});

export default ConfirmModal;
