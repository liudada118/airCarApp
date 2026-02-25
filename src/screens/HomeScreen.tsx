import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ConnectionErrorModal,
  SeatDiagram,
  Toast,
  TopBar,
} from '../components';
import { useSerialConnection } from '../serial';
import { BorderRadius, Colors, FontSize, Spacing } from '../theme';
import type { AirbagValues, ConnectionStatus, SeatStatus } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HomeScreenProps {
  onNavigateToCustomize: () => void;
}

const SeatIcon: React.FC<{ type: 'seated' | 'away'; active: boolean }> = ({
  type,
  active,
}) => {
  const color = active ? Colors.primary : Colors.textGray;
  return (
    <View style={seatIconStyles.container}>
      <View style={[seatIconStyles.seatBack, { borderColor: color }]} />
      <View style={[seatIconStyles.seatBase, { borderColor: color }]} />
      {type === 'seated' ? (
        <View style={[seatIconStyles.personDot, { backgroundColor: color }]} />
      ) : null}
    </View>
  );
};

const seatIconStyles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  seatBack: {
    position: 'absolute',
    width: 20,
    height: 24,
    borderWidth: 2,
    borderRadius: 4,
    top: 2,
    left: 6,
    transform: [{ rotate: '-10deg' }],
  },
  seatBase: {
    position: 'absolute',
    width: 24,
    height: 10,
    borderWidth: 2,
    borderRadius: 3,
    bottom: 4,
    left: 10,
  },
  personDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 6,
    left: 12,
  },
});

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateToCustomize }) => {
  const serial = useSerialConnection();
  const [seatStatus, setSeatStatus] = useState<SeatStatus>('seated');
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'info' | 'error';
  }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const [airbagValues] = useState<AirbagValues>({
    shoulder: 3,
    lumbar: 5,
    sideWing: 4,
    hipFirmness: 2,
    legRest: 3,
  });

  const connectionStatus: ConnectionStatus =
    serial?.connectionStatus ?? 'disconnected';

  useEffect(() => {
    if (serial?.connectionError) {
      setShowConnectionError(true);
    }
  }, [serial?.connectionError]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' = 'success') => {
      setToast({ visible: true, message, type });
    },
    [],
  );

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const hideConnectionError = useCallback(() => {
    setShowConnectionError(false);
    serial?.clearError();
  }, [serial]);

  const handleRefreshDevices = useCallback(() => {
    if (!serial) {
      showToast('Serial module is unavailable.', 'error');
      return;
    }
    serial.refreshDevices().then(list => {
      showToast(`Detected ${list.length} serial device(s).`, 'info');
    }).catch(() => undefined);
  }, [serial, showToast]);

  const handleConnectToggle = useCallback(() => {
    if (!serial) {
      showToast('Serial module is unavailable.', 'error');
      return;
    }

    if (connectionStatus === 'connected') {
      serial.disconnect();
      showToast('Serial disconnected.', 'info');
      return;
    }

    serial.connect().then(ok => {
      showToast(ok ? 'Serial connected.' : 'Serial connection failed.', ok ? 'success' : 'error');
    }).catch(() => undefined);
  }, [connectionStatus, serial, showToast]);

  const connectLabel =
    connectionStatus === 'connected'
      ? 'Disconnect'
      : serial?.connecting
      ? 'Connecting...'
      : 'Connect';

  return (
    <View style={styles.container}>
      <TopBar connectionStatus={connectionStatus} />

      <View style={styles.content}>
        <View style={styles.leftPanel}>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Seat Status</Text>
            </View>
            <View style={styles.seatStatusRow}>
              <TouchableOpacity
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'seated' && styles.seatStatusCardActive,
                ]}
                onPress={() => setSeatStatus('seated')}
                activeOpacity={0.7}
              >
                <SeatIcon type="seated" active={seatStatus === 'seated'} />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'seated' && styles.seatStatusTextActive,
                  ]}
                >
                  Seated
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'away' && styles.seatStatusCardActive,
                ]}
                onPress={() => setSeatStatus('away')}
                activeOpacity={0.7}
              >
                <SeatIcon type="away" active={seatStatus === 'away'} />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'away' && styles.seatStatusTextActive,
                  ]}
                >
                  Away
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Serial Control</Text>
            </View>
            <View style={styles.serialCard}>
              <View style={styles.serialMetaRow}>
                <Text style={styles.serialMetaText}>
                  Devices: {serial?.devices.length ?? 0}
                </Text>
                <Text style={styles.serialMetaText}>
                  Mode: {serial?.mode ?? 'unknown'}
                </Text>
              </View>
              <View style={styles.serialButtons}>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={handleRefreshDevices}
                  activeOpacity={0.7}
                >
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.connectButton,
                    connectionStatus === 'connected' && styles.disconnectButton,
                  ]}
                  onPress={handleConnectToggle}
                  activeOpacity={0.7}
                  disabled={serial?.connecting}
                >
                  <Text style={styles.connectButtonText}>{connectLabel}</Text>
                </TouchableOpacity>
              </View>
              <Text numberOfLines={2} style={styles.serialPreview}>
                {serial?.lastSerialData
                  ? `RX: ${serial.lastSerialData}`
                  : 'No serial frame received yet.'}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Airbag Status</Text>
            </View>
            <View style={styles.airbagStatusCard}>
              <Text style={styles.bodyTypeText}>
                Adaptive profile is active for current body type
              </Text>
              <View style={styles.seatThumbnail}>
                <SeatDiagram
                  activeZone={null}
                  scale={0.55}
                  showAllActive
                  values={airbagValues}
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                onPress={onNavigateToCustomize}
                activeOpacity={0.7}
              >
                <Text style={styles.customizeLink}>Open custom airbag editor</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.rightPanel}>
          <View style={styles.adaptiveSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Adaptive Adjustment</Text>
            </View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  adaptiveEnabled && styles.toggleButtonActive,
                ]}
                onPress={() => setAdaptiveEnabled(true)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    adaptiveEnabled && styles.toggleTextActive,
                  ]}
                >
                  On
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  !adaptiveEnabled && styles.toggleButtonInactive,
                ]}
                onPress={() => setAdaptiveEnabled(false)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !adaptiveEnabled && styles.toggleTextInactive,
                  ]}
                >
                  Off
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.seat3DContainer}>
            <SeatDiagram
              activeZone={null}
              scale={0.9}
              showAllActive={false}
              values={airbagValues}
            />
            <View style={styles.gridOverlay} />
          </View>
        </View>
      </View>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      <ConnectionErrorModal
        visible={showConnectionError}
        message={serial?.connectionError ?? undefined}
        onDismiss={hideConnectionError}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  leftPanel: {
    width: SCREEN_WIDTH * 0.38,
    paddingRight: Spacing.xl,
  },
  rightPanel: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    fontWeight: '500',
  },
  seatStatusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  seatStatusCard: {
    width: 120,
    height: 100,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  seatStatusCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  seatStatusText: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    marginTop: Spacing.sm,
    fontWeight: '500',
  },
  seatStatusTextActive: {
    color: Colors.primary,
  },
  serialCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  serialMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serialMetaText: {
    fontSize: FontSize.sm,
    color: Colors.textLightGray,
  },
  serialButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  refreshButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    borderRadius: BorderRadius.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cardBackgroundLight,
  },
  refreshButtonText: {
    color: Colors.textWhite,
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  connectButton: {
    flex: 1,
    borderRadius: BorderRadius.round,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.buttonBlue,
  },
  disconnectButton: {
    backgroundColor: Colors.cardBackgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderGray,
  },
  connectButtonText: {
    color: Colors.textWhite,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  serialPreview: {
    fontSize: FontSize.sm,
    color: Colors.textLightGray,
  },
  airbagStatusCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  bodyTypeText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  seatThumbnail: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderGray,
    marginVertical: Spacing.md,
  },
  customizeLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  adaptiveSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.round,
    padding: 3,
  },
  toggleButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.round,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
  },
  toggleButtonInactive: {
    backgroundColor: Colors.cardBackgroundLight,
  },
  toggleText: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: Colors.textWhite,
  },
  toggleTextInactive: {
    color: Colors.textGray,
  },
  seat3DContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    opacity: 0.1,
    borderTopWidth: 1,
    borderColor: Colors.textGray,
  },
});

export default HomeScreen;

