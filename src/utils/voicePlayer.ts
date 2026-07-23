/**
 * 语音播报工具：把「小可」的固定话术 MP3 按 key 播放。
 *
 * 用 expo-audio 的命令式 API（createAudioPlayer），组件外也能直接调用。
 * MP3 由 Metro 作为资源打包（默认 assetExts 含 mp3）。
 *
 * 用法：
 *   import {playVoice, VOICE_TEXT} from '../utils/voicePlayer';
 *   playVoice('seat_welcome', () => {  播完回调，用于收起语音条  });
 *
 * 新增一条语音：把 mp3 放进 src/assets/audio/，在 CLIPS 和 VOICE_TEXT 各加一行即可。
 */
import {createAudioPlayer, setAudioModeAsync, type AudioPlayer} from 'expo-audio';

// key → 音频文件
const CLIPS = {
  seat_welcome: require('../assets/audio/seat_welcome.mp3'),
  massage_on: require('../assets/audio/massage_on.mp3'),
  spine_protect: require('../assets/audio/spine_protect.mp3'),
  bump_relief: require('../assets/audio/bump_relief.mp3'),
  motion_sickness: require('../assets/audio/motion_sickness.mp3'),
} as const;

export type VoiceKey = keyof typeof CLIPS;

// key → 语音条显示的文字（与 MP3 完整话术一致；语音条单行，显示到哪截到哪）
export const VOICE_TEXT: Record<VoiceKey, string> = {
  seat_welcome:
    '你好呀～我是您的健康姿态管家小可，很高兴陪您开启这段旅程。气囊自适应调节已开启，我会根据您的坐姿变化，自动调整至更适合您的状态',
  massage_on:
    '注意到您已经驾驶了一段时间，长时间保持坐姿可能会带来疲劳。小可已为您开启舒适调节，自动开启座椅支撑与按摩功能。路途再忙，也别忘了适时停下来休息，平安到达就是最好的旅程。',
  spine_protect:
    '小可注意到您的坐姿重心有所偏移，已悄悄调整侧翼支撑，让座椅更贴合您的身体，提升乘坐舒适感。',
  bump_relief:
    '注意到当前路况有些颠簸，小可已经帮您增强座椅侧翼支撑，提升乘坐稳定性。建议开启越野模式，小可陪您一起应对复杂路况。',
  motion_sickness:
    '感受到当前路况变化，可能会带来晕车的不适感。建议保持头部稳定、看看窗外远方。小可建议您调低空调温度，并播放舒缓音乐，希望陪您轻松度过这段路程～',
};

let audioModeSet = false;
let currentSub: {remove: () => void} | null = null;
let currentPlayer: AudioPlayer | null = null;

/**
 * 播放一条语音；若正在播别的，先停掉再播这条（最新触发覆盖旧的）。
 * @param onFinish 播完回调（可选，用于收起语音条）。
 */
export function playVoice(key: VoiceKey, onFinish?: () => void): void {
  try {
    if (!audioModeSet) {
      audioModeSet = true;
      // 用扬声器外放（不走听筒）；iOS 静音键下也出声。fire-and-forget，不阻塞播放。
      setAudioModeAsync({
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      }).catch(() => {});
    }
    // 停掉并释放上一条（连同它的播完监听）——每次新建播放器，保证从头播、无残留状态
    if (currentSub) {
      try {
        currentSub.remove();
      } catch {}
      currentSub = null;
    }
    if (currentPlayer) {
      try {
        currentPlayer.remove();
      } catch {}
      currentPlayer = null;
    }

    const p = createAudioPlayer(CLIPS[key]);
    currentPlayer = p;
    try {
      p.volume = 1.0; // 音量拉满，防止默认偏低
    } catch {}

    if (onFinish) {
      currentSub = p.addListener('playbackStatusUpdate', (st: any) => {
        if (st?.didJustFinish) {
          try {
            currentSub?.remove();
          } catch {}
          currentSub = null;
          onFinish();
        }
      });
    }
    p.play(); // 新建的播放器位置本就在 0，直接播即可
  } catch {
    // 播放失败不影响主流程，静默
  }
}
