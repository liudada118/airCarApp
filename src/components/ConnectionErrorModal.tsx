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

interface ConnectionErrorModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const ConnectionErrorModal: React.FC<ConnectionErrorModalProps> = ({
  visible,
  onDismiss,
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
            当前软件未能正常连接。请检查您的接线或硬件设备，确保一切连接正确后，重新启动软件。如有持续问题，请联系技术支持。
          </Text>
          <TouchableOpacity onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.linkText}>我知道了</Text>
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
