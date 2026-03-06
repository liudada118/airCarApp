import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import type {ConnectionStatus} from '../types';

// icon 图片资源
const iconLogo = require('../assets/icons/icon-logo.png');
const iconConnection = require('../assets/icons/icon-connection.png');

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
      <Image source={iconLogo} style={styles.logoImage} resizeMode="contain" />
      <View style={styles.statusContainer}>
        <Image
          source={iconConnection}
          style={[styles.connectionIcon, {tintColor: statusColor}]}
          resizeMode="contain"
        />
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
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  logoImage: {
    width: 120,
    height: 30,
  },
  connectionIcon: {
    width: 18,
    height: 18,
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
