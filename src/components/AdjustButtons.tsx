import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';

interface AdjustButtonsProps {
  onIncrease: () => void;
  onDecrease: () => void;
  canIncrease: boolean;
  canDecrease: boolean;
  disabled?: boolean;
}

const AdjustButtons: React.FC<AdjustButtonsProps> = ({
  onIncrease,
  onDecrease,
  canIncrease,
  canDecrease,
  disabled = false,
}) => {
  const increaseEnabled = canIncrease && !disabled;
  const decreaseEnabled = canDecrease && !disabled;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.button,
          increaseEnabled ? styles.increaseButton : styles.disabledButton,
        ]}
        onPress={onIncrease}
        disabled={!increaseEnabled}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.buttonText,
            increaseEnabled ? styles.increaseText : styles.disabledText,
          ]}
        >
          +
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          decreaseEnabled ? styles.decreaseButton : styles.disabledButton,
        ]}
        onPress={onDecrease}
        disabled={!decreaseEnabled}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.buttonText,
            decreaseEnabled ? styles.decreaseText : styles.disabledText,
          ]}
        >
          −
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  increaseButton: {
    backgroundColor: Colors.primary,
  },
  decreaseButton: {
    backgroundColor: '#4A4A5E',
  },
  disabledButton: {
    backgroundColor: '#3A3A4A',
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
  increaseText: {
    color: Colors.textWhite,
  },
  decreaseText: {
    color: Colors.textWhite,
  },
  disabledText: {
    color: Colors.textGray,
  },
});

export default AdjustButtons;
