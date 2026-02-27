import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../theme';
import IconFont from './IconFont';

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
        <IconFont
          name="plus-full"
          size={28}
          color={increaseEnabled ? Colors.textWhite : Colors.textGray}
        />
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
        <IconFont
          name="minus-full"
          size={28}
          color={decreaseEnabled ? Colors.textWhite : Colors.textGray}
        />
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
});

export default AdjustButtons;
