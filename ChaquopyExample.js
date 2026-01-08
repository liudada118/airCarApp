import React, {useState} from 'react';
import {NativeModules, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

const {PyHello} = NativeModules;

export default function ChaquopyExample() {
  const [message, setMessage] = useState('Tap to run test_constant_input');

  const handlePress = () => {
    const startedAt = new Date().toISOString();
    setMessage(`Pressed at ${startedAt}. Starting Python...`);
    if (!PyHello || typeof PyHello.runTestConstantInput !== 'function') {
      setMessage('PyHello module not found. Rebuild the app.');
      return;
    }
    PyHello.runTestConstantInput()
      .then((res) => {
        console.log('Python result:', res);
        setMessage('Python main() finished. Check Logcat for output.');
      })
      .catch(err => {
        setMessage(`Error: ${err?.message || err}`);
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chaquopy Minimal</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>Run Python</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#cbd5f5',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
});
