import React, { useEffect, useMemo, useState } from 'react'
import {
  NativeModules,
  NativeEventEmitter,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView
} from 'react-native'

const { SerialModule } = NativeModules
const CH340_VENDOR_ID = 0x1a86
const CH340_PRODUCT_IDS = new Set([0x7523, 0x5523])

export default function CH340SerialExample() {
  const [devices, setDevices] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [baudRate, setBaudRate] = useState('1000000')
  const [sendText, setSendText] = useState('hello')
  const [opening, setOpening] = useState(false)
  const [logs, setLogs] = useState([])

  const selectedDevice = useMemo(() => {
    return devices[selectedIndex] || null
  }, [devices, selectedIndex])

  useEffect(() => {
    const emitter = new NativeEventEmitter(SerialModule)
    const sub = emitter.addListener('onSerialData', e => {
      console.log('frame:', e.data)
      setLogs(prev => {
        const next = [`RX: ${e.data}`, ...prev]
        return next.slice(0, 200)
      })
    })
    if (SerialModule.resetPendingOpen) {
      SerialModule.resetPendingOpen()
    }
    refreshDevices().catch(err => {
      console.error('device refresh failed', err)
    })
    return () => {
      sub.remove()
      SerialModule.close()
    }
  }, [])

  const refreshDevices = async () => {
    const list = await SerialModule.listDevices()
    setDevices(list)
    if (list.length === 0) {
      setSelectedIndex(0)
      return
    }
    if (selectedIndex >= list.length) {
      setSelectedIndex(0)
    }
  }

  const handleOpen = async () => {
    if (opening) {
      console.log('open request already in progress')
      return
    }
    if (!selectedDevice) {
      console.log('no usb serial devices found')
      return
    }
    const baudValue = parseInt(baudRate, 10)
    if (!Number.isFinite(baudValue) || baudValue <= 0) {
      console.log('invalid baud rate:', baudRate)
      return
    }
    if (SerialModule.resetPendingOpen) {
      SerialModule.resetPendingOpen()
    }
    setOpening(true)
    try {
      await SerialModule.openWithOptions(
        selectedDevice.vendorId,
        selectedDevice.productId,
        { baudRate: baudValue }
      )
      console.log(
        `opened ${selectedDevice.deviceName} @ ${baudValue}`
      )
      setLogs(prev => {
        const next = [
          `OPEN: ${selectedDevice.deviceName} @ ${baudValue}`,
          ...prev
        ]
        return next.slice(0, 200)
      })
    } finally {
      setOpening(false)
    }
  }

  const handleSend = async () => {
    if (!sendText) {
      console.log('send text is empty')
      return
    }
    console.log('tx:', sendText)
    await SerialModule.write(sendText)
    setLogs(prev => {
      const next = [`TX: ${sendText}`, ...prev]
      return next.slice(0, 200)
    })
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: '600' }}>
        CH340 Serial Control
      </Text>

      <View style={{ gap: 6 }}>
        <Text>Devices:</Text>
        {devices.length === 0 ? (
          <Text>no usb serial devices found</Text>
        ) : (
          devices.map((d, idx) => (
            <Pressable
              key={`${d.vendorId}-${d.productId}-${d.deviceId}`}
              onPress={() => setSelectedIndex(idx)}
              style={{
                padding: 10,
                borderWidth: 1,
                borderColor: idx === selectedIndex ? '#0a84ff' : '#999',
                borderRadius: 6
              }}
            >
              <Text>
                {idx === selectedIndex ? '* ' : ''}
                {d.deviceName} ({d.vendorId}:{d.productId})
                {d.vendorId === CH340_VENDOR_ID &&
                CH340_PRODUCT_IDS.has(d.productId)
                  ? ' [CH340]'
                  : ''}
              </Text>
            </Pressable>
          ))
        )}
        <Pressable
          onPress={refreshDevices}
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: '#999',
            borderRadius: 6
          }}
        >
          <Text>Refresh devices</Text>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text>Baud Rate</Text>
        <TextInput
          value={baudRate}
          onChangeText={setBaudRate}
          keyboardType="numeric"
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: '#999',
            borderRadius: 6
          }}
        />
        <Pressable
          onPress={() => handleOpen().catch(err => console.error('serial init failed', err))}
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: opening ? '#999' : '#0a84ff',
            borderRadius: 6
          }}
          disabled={opening}
        >
          <Text>{opening ? 'Opening...' : 'Open'}</Text>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text>Send</Text>
        <TextInput
          value={sendText}
          onChangeText={setSendText}
          placeholder="text to send"
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: '#999',
            borderRadius: 6
          }}
        />
        <Pressable
          onPress={() => handleSend().catch(err => console.error('send failed', err))}
          style={{
            padding: 10,
            borderWidth: 1,
            borderColor: '#0a84ff',
            borderRadius: 6
          }}
        >
          <Text>Send</Text>
        </Pressable>
      </View>

      <View style={{ gap: 6 }}>
        <Text>Log</Text>
        <View
          style={{
            minHeight: 120,
            borderWidth: 1,
            borderColor: '#999',
            borderRadius: 6,
            padding: 10
          }}
        >
          {logs.length === 0 ? (
            <Text>no data yet</Text>
          ) : (
            logs.map((line, idx) => (
              <Text key={`${idx}-${line}`}>{line}</Text>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  )
}
