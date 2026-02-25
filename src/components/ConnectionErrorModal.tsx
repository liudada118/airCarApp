import React from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BorderRadius, Colors, FontSize, Spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ConnectionErrorModalProps {
  visible: boolean;
  message?: string;
  onDismiss: () => void;
}

const DEFAULT_MESSAGE =
  'The app could not establish a stable serial connection. Check the USB device and try again.';

const ConnectionErrorModal: React.FC<ConnectionErrorModalProps> = ({
  visible,
  message,
  onDismiss,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Connection Error</Text>
          <Text style={styles.description}>{message ?? DEFAULT_MESSAGE}</Text>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.linkText}>Dismiss</Text>
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
    width: Math.min(SCREEN_WIDTH * 0.4, 420),
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
  linkText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.primary,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});

export default ConnectionErrorModal;
