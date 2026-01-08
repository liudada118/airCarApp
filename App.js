import React from 'react';
import CH340SerialExample from './CH340SerialExample.js';
import ChaquopyExample from './ChaquopyExample.js';

export default function App() {
  const showChaquopy = false;
  return showChaquopy ? <ChaquopyExample /> : <CH340SerialExample />;
}
