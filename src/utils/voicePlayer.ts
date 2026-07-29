/**
 * 语音播报工具：把「小可」的固定话术 MP3 按 key 播放。
 *
 * 用 expo-audio 的命令式 API（createAudioPlayer），组件外也能直接调用。
 * MP3 由 Metro 作为资源打包（默认 assetExts 含 mp3）。
 *
 * 用法：
 *   import {playVoice, VOICE_TEXT} from '../utils/voicePlayer';
 *   playVoice('seat_welcome', () => {  播完回调，用于收起语音条  });
 *   // 想让语音条文字跟着念到哪显示到哪，再传第三个参数（见 onProgress）
 *
 * 新增一条语音：把 mp3 放进 src/assets/audio/，在 CLIPS 和 VOICE_TEXT 各加一行即可
 * （字幕分句由 VOICE_TEXT 自动切分，不用额外维护）。
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
    '注意到您已经驾驶了一段时间，长时间保持坐姿可能会带来疲劳。小可已为您开启舒适调节，自动开启座椅软硬度支撑与按摩功能。路途再忙，也别忘了适时停下来休息，平安到达就是最好的旅程。',
  spine_protect:
    '小可注意到您的坐姿重心有所偏移，已悄悄调整侧翼支撑，让座椅更贴合您的身体，提升乘坐舒适感。',
  bump_relief:
    '注意到当前路况有些颠簸，小可已经帮您增强座椅侧翼支撑，提升乘坐稳定性。建议开启越野模式，小可陪您一起应对复杂路况。',
  motion_sickness:
    '小可感受到当前路况变化，可能会增加晕车的不适感。建议乘客保持头部稳定，眺望远方。驾驶时尽量保持平稳加减速，减少频繁刹车和油门操作，降低车辆晃动带来的影响。小可已建议优化车内环境，调节空气流通并播放舒缓音乐，希望陪您舒适度过这段路程～',
};

// ─── 字幕分句：把整句切成语音条放得下的短句 ────────────────────────
// 语音条单行可用宽度约 285px、字号 13 → 一行约 20 个中文字。
const SEG_MAX = 20; // 一段最多几个字（超了继续切）
const SEG_MIN = 7; // 一段少于几个字就并到下一段（避免"好呀～"这种碎片一闪而过）

/** 在标点处切句：标点留在前一段（用于算权重），显示时再 trim 掉。 */
function splitByPunctuation(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if ('，。；！？～、,;!?'.includes(ch)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 过长的段按 SEG_MAX 硬切（没有标点可依时的兜底）。 */
function hardWrap(seg: string): string[] {
  if (seg.length <= SEG_MAX) return [seg];
  const out: string[] = [];
  for (let i = 0; i < seg.length; i += SEG_MAX) out.push(seg.slice(i, i + SEG_MAX));
  return out;
}

/**
 * 把一条话术切成字幕片段。
 * raw = 含标点的原文（用来按字数分配时长），text = 去掉句末标点的显示文字。
 */
function buildSegments(text: string): Array<{raw: string; text: string}> {
  const pieces = splitByPunctuation(text).flatMap(hardWrap);
  // 太短的片段并到下一段（合并后不超过 SEG_MAX 才并）
  const merged: string[] = [];
  for (const p of pieces) {
    const prev = merged[merged.length - 1];
    if (prev && prev.length < SEG_MIN && prev.length + p.length <= SEG_MAX) {
      merged[merged.length - 1] = prev + p;
    } else {
      merged.push(p);
    }
  }
  // 末尾如果剩个碎片，并回上一段（宁可稍微超宽，也别单独闪一下）
  if (merged.length > 1 && merged[merged.length - 1].length < SEG_MIN) {
    merged[merged.length - 2] += merged.pop();
  }
  return merged.map(raw => ({raw, text: raw.replace(/[，。；、,;]+$/, '')}));
}

/** key → 字幕片段（含每段的起止进度比例，0～1）。 */
export const VOICE_SEGMENTS: Record<
  VoiceKey,
  Array<{text: string; start: number; end: number}>
> = Object.fromEntries(
  (Object.keys(VOICE_TEXT) as VoiceKey[]).map(key => {
    const segs = buildSegments(VOICE_TEXT[key]);
    const total = segs.reduce((s, x) => s + x.raw.length, 0) || 1;
    let acc = 0;
    return [
      key,
      segs.map(seg => {
        const start = acc / total;
        acc += seg.raw.length;
        return {text: seg.text, start, end: acc / total};
      }),
    ];
  }),
) as Record<VoiceKey, Array<{text: string; start: number; end: number}>>;

/**
 * 按播放进度算当前该显示第几段字幕。
 * @param progress 播放进度比例 0～1（currentTime / duration）
 */
export function segmentIndexAt(key: VoiceKey, progress: number): number {
  const segs = VOICE_SEGMENTS[key];
  if (!segs?.length) return 0;
  const p = Math.min(Math.max(progress, 0), 0.999);
  for (let i = 0; i < segs.length; i++) {
    if (p < segs[i].end) return i;
  }
  return segs.length - 1;
}

/** 无音频时(总开关关闭/播放失败)按字数估算的整句时长，用于假进度推字幕。 */
export const MS_PER_CHAR = 200;
export function estimateDurationMs(key: VoiceKey): number {
  return Math.max(2000, VOICE_TEXT[key].length * MS_PER_CHAR);
}

let audioModeSet = false;
let currentSub: {remove: () => void} | null = null;
let currentPlayer: AudioPlayer | null = null;

/**
 * 播放一条语音；若正在播别的，先停掉再播这条（最新触发覆盖旧的）。
 * @param onFinish 播完回调（可选，用于收起语音条）。
 * @param onProgress 播放进度回调（可选，约每 100ms 一次，用于让语音条字幕跟着念）。
 *                   progress 为 0～1；duration 未就绪时不回调。
 */
export function playVoice(
  key: VoiceKey,
  onFinish?: () => void,
  onProgress?: (progress: number) => void,
): void {
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

    // updateInterval：状态回调频率（默认 500ms 太粗，字幕会跟不上）
    const p = createAudioPlayer(CLIPS[key], {updateInterval: 100});
    currentPlayer = p;
    try {
      p.volume = 1.0; // 音量拉满，防止默认偏低
    } catch {}

    if (onFinish || onProgress) {
      currentSub = p.addListener('playbackStatusUpdate', (st: any) => {
        // 字幕进度：duration 要等音频加载完才有值，没有就先不动
        if (onProgress && st?.duration > 0) {
          onProgress(st.currentTime / st.duration);
        }
        if (st?.didJustFinish) {
          try {
            currentSub?.remove();
          } catch {}
          currentSub = null;
          onFinish?.();
        }
      });
    }
    p.play(); // 新建的播放器位置本就在 0，直接播即可
  } catch {
    // 播放失败也要释放上层队列，避免后续语音一直被阻塞。
    onFinish?.();
  }
}
