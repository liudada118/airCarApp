import React, {useMemo} from 'react';
import {Image, ImageBackground, StyleSheet, Text, View} from 'react-native';

const seatImg = require('../image/seat.png');
const seatIcon = require('../image/seatIcon.png');
const onSelect = require('../image/onselect.png');

const onMassage = require('../image/onmassage.png');
const unMassage = require('../image/unmassage.png');

const onAdmit = require('../image/onadmit.png');
const unAdmit = require('../image/unadmit.png');
const onAdmitText = require('../image/onadmitText.png');
const unAdmitText = require('../image/unadmitText.png');

const onChild = require('../image/onchild.png');
const unChild = require('../image/unchild.png');
const onChildText = require('../image/onchildText.png');
const unChildText = require('../image/unchildText.png');

const onThing = require('../image/onthing.png');
const unThing = require('../image/unthing.png');
const onThingText = require('../image/onthingText.png');
const unThingText = require('../image/unthingText.png');

const onOnSeat = require('../image/ononseat.png');
const unOnSeat = require('../image/unonseat.png');
const onOnSeatText = require('../image/ononseatText.png');
const unOnSeatText = require('../image/unonseatText.png');

const onOutSeat = require('../image/onoutseat.png');
const unOutSeat = require('../image/unoutseat.png');
const onOutSeatText = require('../image/onoutseatText.png');
const unOutSeatText = require('../image/unoutseatText.png');

const onAdaText = require('../image/onAdaptiveText.png');
const unAdaText = require('../image/unAdaptiveText.png');
const onAdaIcon = require('../image/onAdaptiveIcon.png');
const unAdaIcon = require('../image/unAdaptiveIcon.png');

const pyMap = {
  OFF_SEAT: 'off',
  CUSHION_ONLY: 'on',
  ADAPTIVE_LOCKED: 'on',
  RESETTING: 'off',
  '\u672a\u542f\u7528': '',
  '\u5927\u4eba': 'adult',
  '\u5c0f\u5b69': 'child',
  '\u9759\u7269': 'thing',
  '\u5728\u5ea7': 'on',
  '\u79bb\u5ea7': 'off',
};

const airArr = [
  {top: 30.3, left: 35, width: 12, height: 3.8, type: 'rect'},
  {top: 30.3, left: 52, width: 12, height: 3.8, type: 'rect'},
  {top: 49.3, left: 28, width: 5, height: 9.5, type: 'rect'},
  {top: 49.3, left: 67, width: 5, height: 9.5, type: 'rect'},
  {top: 50.05, left: 41, width: 18, height: 6, type: 'rect'},
  {top: 58.1, left: 41, width: 18, height: 6, type: 'rect'},
  {top: 65.5, left: 39, width: 11, height: 10, type: 'rect'},
  {top: 65.5, left: 50, width: 11, height: 10, type: 'rect'},
  {top: 75.8, left: 38, width: 10, height: 4.8, type: 'rect'},
  {top: 75.8, left: 52, width: 10, height: 4.8, type: 'rect'},
  {top: 35.3, left: 42, width: 5, type: 'circle'},
  {top: 35.3, left: 53, width: 5, type: 'circle'},
  {top: 43.3, left: 42, width: 5, type: 'circle'},
  {top: 43.3, left: 53, width: 5, type: 'circle'},
  {top: 51.3, left: 42, width: 5, type: 'circle'},
  {top: 51.3, left: 53, width: 5, type: 'circle'},
  {top: 59.3, left: 42, width: 5, type: 'circle'},
  {top: 59.3, left: 53, width: 5, type: 'circle'},
  {top: 66.3, left: 42, width: 5, type: 'circle'},
  {top: 66.3, left: 53, width: 5, type: 'circle'},
  {top: 71.3, left: 42, width: 5, type: 'circle'},
  {top: 71.3, left: 53, width: 5, type: 'circle'},
  {top: 76.3, left: 42, width: 5, type: 'circle'},
  {top: 76.3, left: 53, width: 5, type: 'circle'},
];

const safetyItems = [
  {
    key: 'child',
    onIcon: onChild,
    unIcon: unChild,
    onText: onChildText,
    unText: unChildText,
  },
  {
    key: 'adult',
    onIcon: onAdmit,
    unIcon: unAdmit,
    onText: onAdmitText,
    unText: unAdmitText,
  },
  {
    key: 'thing',
    onIcon: onThing,
    unIcon: unThing,
    onText: onThingText,
    unText: unThingText,
  },
];

const seatItems = [
  {
    key: 'on',
    onIcon: onOnSeat,
    unIcon: unOnSeat,
    onText: onOnSeatText,
    unText: unOnSeatText,
  },
  {
    key: 'off',
    onIcon: onOutSeat,
    unIcon: unOutSeat,
    onText: onOutSeatText,
    unText: unOutSeatText,
  },
];

function mapStatus(value) {
  if (!value) return '';
  return pyMap[value] || value;
}

export function AirAsideLeftRN({data = {}}) {
  const bodyType = mapStatus(data.body_type);
  const seatState = mapStatus(data.seat_state);

  return (
    <View style={styles.section}>
      <Title icon={<Text style={styles.iconText}>S</Text>} text="Safety" />
      <View style={styles.row}>
        {safetyItems.map(item => {
          const active = bodyType === item.key;
          return (
            <View key={item.key} style={styles.item}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Image source={active ? item.onIcon : item.unIcon} style={styles.icon} />
              </View>
              <Image source={onSelect} style={[styles.selectBadge, {opacity: active ? 1 : 0}]} />
              <Image source={active ? item.onText : item.unText} style={styles.labelImg} />
            </View>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Title icon={<Image source={seatIcon} style={styles.seatIcon} />} text="Seat" />
      <View style={styles.row}>
        {seatItems.map(item => {
          const active = seatState === item.key;
          return (
            <View key={item.key} style={styles.item}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                <Image source={active ? item.onIcon : item.unIcon} style={styles.icon} />
              </View>
              <Image source={onSelect} style={[styles.selectBadge, {opacity: active ? 1 : 0}]} />
              <Image source={active ? item.onText : item.unText} style={styles.labelImg} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function AirAsideRightRN({data = {}}) {
  const controlFeed = data.controlFeed || data.control_command || [];

  return (
    <View style={styles.section}>
      <Title icon={<Text style={styles.iconText}>A</Text>} text="Airbags" />
      <ImageBackground source={seatImg} style={styles.seatBg} resizeMode="contain">
        {airArr.map((a, index) => {
          const active = controlFeed && controlFeed[index] === 3;
          if (a.type === 'circle') {
            return (
              <Image
                key={`c-${index}`}
                source={active ? onMassage : unMassage}
                style={[
                  styles.circle,
                  {
                    width: `${a.width}%`,
                    left: `${a.left}%`,
                    top: `${a.top}%`,
                  },
                ]}
                resizeMode="contain"
              />
            );
          }
          return (
            <View
              key={`r-${index}`}
              style={[
                styles.rect,
                active && styles.rectActive,
                {
                  width: `${a.width}%`,
                  height: `${a.height}%`,
                  left: `${a.left}%`,
                  top: `${a.top}%`,
                },
              ]}
            />
          );
        })}
      </ImageBackground>
    </View>
  );
}

export function AirAdaptiveTagRN({data = {}, style}) {
  const useAlgo = data.controlsMode === 'algor';
  return (
    <View style={[styles.centerTag, style]}>
      <Image source={useAlgo ? onAdaIcon : unAdaIcon} style={styles.adaptIcon} />
      <Image source={useAlgo ? onAdaText : unAdaText} style={styles.adaptText} />
    </View>
  );
}

export default function AirAsideRN({data = {}}) {
  return (
    <View style={styles.container}>
      <AirAsideLeftRN data={data} />
      <AirAdaptiveTagRN data={data} />
      <AirAsideRightRN data={data} />
    </View>
  );
}

function Title({icon, text}) {
  return (
    <View style={styles.titleRow}>
      {icon}
      <Text style={styles.titleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
  },
  section: {
    backgroundColor: '#151821',
    borderRadius: 10,
    padding: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  titleText: {
    color: '#e6e9ff',
    fontSize: 14,
    fontWeight: '600',
  },
  iconText: {
    color: '#8aa4ff',
    fontSize: 14,
    fontWeight: '700',
  },
  seatIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  iconWrap: {
    borderWidth: 1,
    borderColor: '#2b2f3c',
    borderRadius: 10,
    padding: 6,
    marginBottom: 6,
  },
  iconWrapActive: {
    borderColor: '#7a87ff',
  },
  icon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  labelImg: {
    width: 54,
    height: 16,
    resizeMode: 'contain',
  },
  selectBadge: {
    width: 24,
    height: 6,
    resizeMode: 'contain',
    marginBottom: 4,
  },
  divider: {
    height: 10,
  },
  centerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adaptIcon: {
    width: 36,
    height: 36,
    resizeMode: 'contain',
  },
  adaptText: {
    width: 64,
    height: 20,
    resizeMode: 'contain',
  },
  seatBg: {
    width: 180,
    aspectRatio: 0.6,
    alignSelf: 'center',
    position: 'relative',
  },
  rect: {
    position: 'absolute',
    borderRadius: 4,
    backgroundColor: 'rgba(52, 58, 78, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(118, 128, 180, 0.6)',
  },
  rectActive: {
    backgroundColor: 'rgba(128, 224, 140, 0.6)',
    borderColor: 'rgba(120, 220, 150, 0.9)',
  },
  circle: {
    position: 'absolute',
    height: undefined,
    aspectRatio: 1,
  },
});
