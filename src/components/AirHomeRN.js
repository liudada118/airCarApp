import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Image,
  NativeEventEmitter,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CarAirRN from './CarAirRN';
import {AirAdaptiveTagRN, AirAsideLeftRN, AirAsideRightRN} from './AirAsideRN';

const AIR_LOGO = require('../../image/airLogo.png');
const {SerialModule} = NativeModules;

function parseSerialFrame(payload) {
  if (typeof payload !== 'string' || payload.trim() === '') return null;
  const parts = payload.split(',');
  const values = [];
  for (let i = 0; i < parts.length; i += 1) {
    const value = Number.parseInt(parts[i], 10);
    if (Number.isNaN(value)) {
      return null;
    }
    values.push(value);
  }
  return values;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default function AirHomeRN({data = {}}) {
  const airData = useMemo(() => data, [data]);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [lastSerial, setLastSerial] = useState('');
  const [serialMatrix, setSerialMatrix] = useState(null);

  const handleConnect = useCallback(async () => {
    if (connecting) return;
    if (!SerialModule?.listDevices || !SerialModule?.openWithOptions) {
      setConnectError('serial module unavailable');
      return;
    }
    setConnecting(true);
    setConnectError(null);
    try {
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (SerialModule.resetPendingOpen) {
          SerialModule.resetPendingOpen();
        }
        if (SerialModule.close && attempt > 0) {
          SerialModule.close();
        }

        const list = await SerialModule.listDevices();
        const devices = Array.isArray(list) ? list : [];
        const target = devices.find(d => Number(d?.productId ?? 0) !== 0);
        if (!target) {
          throw new Error('no eligible device');
        }

        try {
          await SerialModule.openWithOptions(
            target.vendorId,
            target.productId,
            {baudRate: 1000000}
          );
          return;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await sleep(400 + attempt * 300);
          }
        }
      }
      throw lastError;
    } catch (err) {
      setConnectError(err?.message || String(err));
    } finally {
      setConnecting(false);
    }
  }, [connecting]);

  useEffect(() => {
    if (!SerialModule) return;
    const emitter = new NativeEventEmitter(SerialModule);
    const dataSub = emitter.addListener('onSerialData', e => {
      const payload = e?.data ?? '';
      // console.log('serial:data', payload);
      if (payload) {
        setLastSerial(payload);
        const parsed = parseSerialFrame(payload);
        if (parsed) {
          setSerialMatrix(parsed);
        }
      }
    });
    const resultSub = emitter.addListener('onSerialResult', e => {
      if (e?.error) {
        // console.log('serial:error', e.error);
      }
      if (e?.result) {
        // console.log('serial:result', e.result);
      }
    });
    const modeSub = emitter.addListener('onSerialMode', e => {
      // console.log('serial:mode', e);
    });
    return () => {
      dataSub.remove();
      resultSub.remove();
      modeSub.remove();
    };
  }, []);

  const matrix = serialMatrix && serialMatrix.length
    ? serialMatrix
    : (airData?.carAir || airData?.sensor || []);

  return (
    <View style={styles.container}>
      <CarAirRN data={matrix} style={styles.canvas} />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.titleBar}>
          <View style={styles.titleLeft}>
            <Image source={AIR_LOGO} style={styles.logo} />
            <Text style={styles.titleText}>Air Seat</Text>
          </View>
          <Pressable
            onPress={() => handleConnect()}
            style={({pressed}) => [
              styles.connectButton,
              pressed && styles.connectButtonPressed,
              connecting && styles.connectButtonDisabled,
            ]}
            disabled={connecting}
          >
            <Text style={styles.connectText}>
              {connecting ? 'Connecting...' : 'Connect'}
            </Text>
          </Pressable>
        </View>
        {connectError ? (
          <View style={styles.connectError}>
            <Text style={styles.connectErrorText}>{connectError}</Text>
          </View>
        ) : null}
        {lastSerial ? (
          <View style={styles.serialOverlay}>
            <Text numberOfLines={2} style={styles.serialText}>
              RX: {lastSerial}
            </Text>
          </View>
        ) : null}
        <View style={[styles.sidebar, styles.left]}>
          <AirAsideLeftRN data={airData} />
        </View>
        <View style={[styles.sidebar, styles.right]}>
          <AirAsideRightRN data={airData} />
        </View>
        <AirAdaptiveTagRN data={airData} style={styles.centerTag} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f16',
  },
  canvas: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  titleBar: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  titleText: {
    color: '#e6e9ff',
    fontSize: 16,
    fontWeight: '600',
  },
  connectButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#2c6bed',
  },
  connectButtonPressed: {
    opacity: 0.8,
  },
  connectButtonDisabled: {
    backgroundColor: '#3a4a6b',
  },
  connectText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  connectError: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 60, 60, 0.8)',
  },
  connectErrorText: {
    color: '#fff',
    fontSize: 11,
  },
  serialOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 14, 24, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(124, 196, 255, 0.5)',
  },
  serialText: {
    color: '#cfe6ff',
    fontSize: 11,
  },
  sidebar: {
    position: 'absolute',
    top: 80,
  },
  left: {
    left: 16,
  },
  right: {
    right: 16,
  },
  centerTag: {
    position: 'absolute',
    top: 80,
    left: '50%',
    transform: [{translateX: -60}],
    backgroundColor: 'rgba(11, 15, 22, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
});

