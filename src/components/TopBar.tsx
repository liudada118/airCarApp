import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import IconFont from './IconFont';
import type {ConnectionStatus} from '../types';

interface TopBarProps {
  connectionStatus: ConnectionStatus;
  onRetry?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({connectionStatus, onRetry}) => {
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

  const showRetry =
    onRetry &&
    (connectionStatus === 'disconnected' || connectionStatus === 'error');

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>SHROOM</Text>
      <View style={styles.statusContainer}>
        <IconFont name="lujing2" size={18} color={statusColor} />
        <Text style={[styles.statusText, {color: statusColor}]}>
          {statusText}
        </Text>
        {connectionStatus === 'connecting' && (
          <ActivityIndicator
            size="small"
            color={Colors.warning}
            style={styles.spinner}
          />
        )}
        {showRetry && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={onRetry}
            activeOpacity={0.7}>
            <Text style={styles.retryText}>重新连接</Text>
          </TouchableOpacity>
        )}
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
  spinner: {
    marginLeft: Spacing.xs,
  },
  retryBtn: {
    marginLeft: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
  },
  retryText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textWhite,
  },
});

export default TopBar;
