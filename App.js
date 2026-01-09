import React from 'react';
import CH340SerialExample from './CH340SerialExample.js';
import ChaquopyExample from './ChaquopyExample.js';
import AirHomeRN from './airComponentsRn/AirHomeRN';

export default function App() {
  const showAirHome = true;
  if (showAirHome) {
    return <AirHomeRN data={{}} />;
  }
  const showChaquopy = false;
  return showChaquopy ? <ChaquopyExample /> : <CH340SerialExample />;
}
