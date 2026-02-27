import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, FontSize, Spacing } from '../theme';
import IconFont from './IconFont';
import type { ConnectionStatus } from '../types';

interface TopBarProps {
  connectionStatus: ConnectionStatus;
}

const TopBar: React.FC<TopBarProps> = ({ connectionStatus }) => {
  const statusText =
    connectionStatus === 'connected'
      ? '已连接'
      : connectionStatus === 'connecting'
      ? '连接中'
      : connectionStatus === 'error'
      ? '连接异常'
      : '未连接';

  const statusColor =
    connectionStatus === 'connected'
      ? Colors.primary
      : connectionStatus === 'connecting'
      ? Colors.warning
      : connectionStatus === 'error'
      ? Colors.error
      : Colors.textGray;

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SHROOM</Text>
      <View style={styles.statusContainer}>
        <IconFont name="lujing2" size={18} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {statusText}
        </Text>
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
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusText: {
    fontSize: FontSize.md,
    fontWeight: '500',
  },
});

export default TopBar;
