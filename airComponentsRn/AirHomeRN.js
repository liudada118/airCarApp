import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import CarAirRN from './CarAirRN';
import {AirAdaptiveTagRN, AirAsideLeftRN, AirAsideRightRN} from './AirAsideRN';

export default function AirHomeRN({data = {}}) {
  const airData = useMemo(() => data, [data]);
  const matrix = useMemo(() => airData?.carAir || airData?.sensor || [], [airData]);

  return (
    <View style={styles.container}>
      <CarAirRN data={matrix} style={styles.canvas} />
      <View pointerEvents="box-none" style={styles.overlay}>
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
  sidebar: {
    position: 'absolute',
    top: 16,
  },
  left: {
    left: 16,
  },
  right: {
    right: 16,
  },
  centerTag: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: [{translateX: -60}],
    backgroundColor: 'rgba(11, 15, 22, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
});
