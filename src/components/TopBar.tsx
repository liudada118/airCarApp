import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSerialConnection } from '../serial';
import { Colors, FontSize, Spacing } from '../theme';
import type { ConnectionStatus } from '../types';

interface TopBarProps {
  connectionStatus?: ConnectionStatus;
  onConnectPress?: () => void;
  onDisconnectPress?: () => void;
  connecting?: boolean;
}

const BluetoothIcon: React.FC<{ color: string }> = ({ color }) => (
  <View style={btStyles.container}>
    <View style={[btStyles.diamond, { borderColor: color }]} />
    <View style={[btStyles.line, { backgroundColor: color }]} />
  </View>
);

const btStyles = StyleSheet.create({
  container: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  diamond: {
    width: 10,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  line: {
    position: 'absolute',
    width: 1.5,
    height: 18,
  },
});

const TopBar: React.FC<TopBarProps> = ({
  connectionStatus = 'disconnected',
  onConnectPress,
  onDisconnectPress,
  connecting,
}) => {
  const serial = useSerialConnection();
  const effectiveStatus = serial?.connectionStatus ?? connectionStatus;
  const isConnected = effectiveStatus === 'connected';
  const isConnecting = serial?.connecting ?? connecting ?? false;

  const statusText =
    effectiveStatus === 'connected'
      ? 'Connected'
      : effectiveStatus === 'error'
      ? 'Connection Error'
      : 'Disconnected';

  const statusColor =
    effectiveStatus === 'connected'
      ? Colors.primary
      : effectiveStatus === 'error'
      ? Colors.error
      : Colors.textGray;

  const connectAction =
    onConnectPress ??
    (serial
      ? () => {
          serial.connect().catch(() => undefined);
        }
      : undefined);

  const disconnectAction = onDisconnectPress ?? serial?.disconnect;
  const controlAction = isConnected ? disconnectAction : connectAction;
  const controlLabel = isConnected
    ? 'Disconnect'
    : isConnecting
    ? 'Connecting...'
    : 'Connect';

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SHROOM</Text>
      <View style={styles.rightGroup}>
        <View style={styles.statusContainer}>
          <BluetoothIcon color={statusColor} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
        </View>
        {controlAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.connectButton,
              (pressed || isConnecting) && styles.connectButtonPressed,
              isConnected && styles.disconnectButton,
            ]}
            onPress={controlAction}
            disabled={isConnecting}
          >
            <Text style={styles.connectButtonText}>{controlLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  logo: {
    fontSize: FontSize.xxl,
    fontWeight: '800',
    color: Colors.textWhite,
    letterSpacing: 2,
    fontStyle: 'italic',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
  connectButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.buttonBlue,
  },
  disconnectButton: {
    backgroundColor: Colors.cardBackgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderGray,
  },
  connectButtonPressed: {
    opacity: 0.8,
  },
  connectButtonText: {
    color: Colors.textWhite,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});

export default TopBar;

