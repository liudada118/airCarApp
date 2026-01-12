/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App.js';
import { name as appName } from './app.json';

if (typeof global.TextDecoder === 'undefined') {
  const decodeUtf8 = input => {
    let bytes = input;
    if (input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (ArrayBuffer.isView(input)) {
      bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }

    let out = '';
    let i = 0;
    while (i < bytes.length) {
      const b0 = bytes[i++];
      if (b0 < 0x80) {
        out += String.fromCharCode(b0);
        continue;
      }
      if ((b0 & 0xe0) === 0xc0) {
        const b1 = bytes[i++] & 0x3f;
        out += String.fromCharCode(((b0 & 0x1f) << 6) | b1);
        continue;
      }
      if ((b0 & 0xf0) === 0xe0) {
        const b1 = bytes[i++] & 0x3f;
        const b2 = bytes[i++] & 0x3f;
        out += String.fromCharCode(((b0 & 0x0f) << 12) | (b1 << 6) | b2);
        continue;
      }
      if ((b0 & 0xf8) === 0xf0) {
        const b1 = bytes[i++] & 0x3f;
        const b2 = bytes[i++] & 0x3f;
        const b3 = bytes[i++] & 0x3f;
        let code = ((b0 & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3;
        code -= 0x10000;
        out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      }
    }
    return out;
  };

  class TextDecoderPolyfill {
    constructor(encoding = 'utf-8') {
      this.encoding = encoding;
    }
    decode(input = new Uint8Array()) {
      return decodeUtf8(input);
    }
  }

  global.TextDecoder = TextDecoderPolyfill;
}

if (typeof global.navigator === 'undefined') {
  global.navigator = {};
}
if (!global.navigator.userAgent) {
  global.navigator.userAgent = 'ReactNative';
}

AppRegistry.registerComponent(appName, () => App);
