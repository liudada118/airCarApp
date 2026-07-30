import React, {useState, useCallback, useRef, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  ScrollView,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {LinearGradient} from 'expo-linear-gradient';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {
  TopBar,
  CustomSeatDiagram,
  CustomAirbagLabel,
  AdjustButtons,
  ConfirmModal,
  SavingModal,
  Toast,
  SeatFront,
  ModalCard,
} from '../components';
import {AIRBAG_ZONE_TO_PARTS} from '../components/SeatFront';
import IconFont from '../components/IconFont';
import type {
  CustomAirbagZone,
  CustomAirbagValues,
  CustomAirbagZoneConfig,
  ModalType,
  ConnectionStatus,
  BodyShape,
  SeatStatus,
  AirbagCommandStates,
} from '../types';
import {DEFAULT_CUSTOM_AIRBAG_VALUES, ALL_CUSTOM_AIRBAG_ZONES, parseAirbagCommand, DEFAULT_AIRBAG_COMMAND_STATES} from '../types';

/** AsyncStorage 缓存 key 前缀，按体型分类存储 */
const ASYNC_STORAGE_KEY_PREFIX = 'custom_airbag_values_';
const LEGACY_ASYNC_STORAGE_KEY = 'custom_airbag_values';

const sm = NativeModules.SerialModule;
const serialEmitter = sm ? new NativeEventEmitter(sm as never) : null;

/** 气囊区域配置 - 5 组气囊 */
const AIRBAG_ZONES: CustomAirbagZoneConfig[] = [
  // 左侧标签
  {key: 'shoulder', label: '肩部气囊', side: 'left'},
  {key: 'lumbar', label: '腰托气囊', side: 'left'},
  {key: 'legRest', label: '腿托气囊', side: 'left'},
  // 右侧标签
  {key: 'sideWing', label: '侧翼气囊', side: 'right'},
  {key: 'hipFirm', label: '臀部软硬度气囊', side: 'right'},
];

/**
 * 每个标签的竖直微调(单位 px):正数=往下移,负数=往上移,0=不动。
 * 想把哪个标签往下调,就把对应这行的数字改成正数(比如 legRest: 24)。
 * 只移动这一个标签,不影响其它。
 */
const LABEL_OFFSET_Y: Record<string, number> = {
  shoulder: 0,   // 肩部气囊
  lumbar: 100,     // 腰托气囊
  legRest: 110,    // 腿托气囊
  sideWing: 80,   // 侧翼气囊
  hipFirm: 80,    // 臀部软硬度气囊
};

/** 气囊区域中文名 */
const ZONE_LABELS: Record<string, string> = {
  shoulder: '肩部气囊',
  sideWing: '侧翼气囊',
  lumbar: '腰托气囊',
  hipFirm: '臀部软硬度气囊',
  legRest: '腿托气囊',
};

/** 气囊区域简短名 */
const ZONE_SHORT_LABELS: Record<string, string> = {
  shoulder: '肩部',
  sideWing: '侧翼',
  lumbar: '腰托',
  hipFirm: '臀部',
  legRest: '腿托',
};

const MAX_VALUE = 3;
const MAX_LOG_LINES = 50;

const clampAirbagLevel = (value: number) =>
  Math.max(0, Math.min(MAX_VALUE, Math.round(Number.isFinite(value) ? value : 0)));

const normalizeAirbagValues = (
  values: CustomAirbagValues,
): CustomAirbagValues => ({
  shoulder: clampAirbagLevel(values.shoulder),
  sideWing: clampAirbagLevel(values.sideWing),
  lumbar: clampAirbagLevel(values.lumbar),
  hipFirm: clampAirbagLevel(values.hipFirm),
  legRest: clampAirbagLevel(values.legRest),
});

/** 气囊区域 → 算法 frontCmd 的 partCmd 编号（1肩/2侧翼/3腰托/4臀/5腿托） */
const ZONE_TO_PART: Record<string, number> = {
  shoulder: 1,
  sideWing: 2,
  lumbar: 3,
  hipFirm: 4,
  legRest: 5,
};

/** 根据气囊区域获取锁定持续时间（毫秒）：腰部和臀部 3秒，其他 2秒 */
function getLockDuration(zone: string): number {
  if (zone === 'lumbar' || zone === 'hipFirm') {
    return 3000;
  }
  return 2000;
}

/** 进入弹窗时气囊放气恢复初始状态的时长(毫秒) */
const INIT_LOADING_MS = 5000;

/** 圆点旋转加载指示器(蓝色,白卡片上用) */
const LoadingSpinner: React.FC = () => {
  const rotateAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [rotateAnim]);
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View style={[loadingStyles.spinner, {transform: [{rotate}]}]}>
      {[...Array(8)].map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x = Math.cos(angle) * 16;
        const y = Math.sin(angle) * 16;
        const opacity = 0.15 + (i / 8) * 0.85;
        return (
          <View
            key={i}
            style={[
              loadingStyles.dot,
              {left: 20 + x - 3.5, top: 20 + y - 3.5, opacity},
            ]}
          />
        );
      })}
    </Animated.View>
  );
};

interface CmdLog {
  id: number;
  time: string;
  zone: string;
  action: string;
  hex: string;
  bytes: number;
}

interface CustomAirbagScreenProps {
  onClose: () => void;
  onSaveSuccess: (values: CustomAirbagValues) => void;
  initialValues?: CustomAirbagValues;
  adaptiveEnabled?: boolean;
  bodyShape?: BodyShape;
  /** 手动调节气囊时的回调，用于重置入座定时充气 */
  onManualAdjust?: () => void;
  /** 在座/离座状态（由 HomeScreen 算法上报，App 转发）→ 联动「点」显示 */
  seatStatus?: SeatStatus;
}

const CustomAirbagScreen: React.FC<CustomAirbagScreenProps> = ({
  onClose,
  onSaveSuccess,
  initialValues,
  bodyShape = '',
  onManualAdjust,
  seatStatus = 'away',
}) => {
  /** 根据体型获取存储 key */
  const storageKey = bodyShape ? `${ASYNC_STORAGE_KEY_PREFIX}${bodyShape}` : LEGACY_ASYNC_STORAGE_KEY;
  const [connectionStatus] = useState<ConnectionStatus>('connected');
  // 进入弹窗即显示的「气囊恢复初始状态」Loading 覆盖层,5 秒后自动消失
  const [initLoading, setInitLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setInitLoading(false), INIT_LOADING_MS);
    return () => clearTimeout(t);
  }, []);
  const [selectedZone, setSelectedZone] = useState<CustomAirbagZone>('lumbar');
  const [commandStates, setCommandStates] = useState<AirbagCommandStates>(DEFAULT_AIRBAG_COMMAND_STATES);

  // ━━━ 同步初始化：用 initialValues 作为初始值，确保首次渲染就有正确的值 ━━━
  const initValues = normalizeAirbagValues(
    initialValues || DEFAULT_CUSTOM_AIRBAG_VALUES,
  );

  const [airbagValues, setAirbagValues] = useState<CustomAirbagValues>(initValues);
  const [storageLoaded, setStorageLoaded] = useState(false);

  // 异步兑底：仅在没有 initialValues 时从存储中读取，避免闪现
  useEffect(() => {
    // 如果 App 层已传入 initialValues，直接信任，不再异步加载
    if (initialValues) {
      setStorageLoaded(true);
      return;
    }

    const loadSavedValues = async () => {


      // 加载成功后同时更新 airbagValues 和 cmdCounts
      const applyLoadedValues = (values: CustomAirbagValues) => {
        const normalizedValues = normalizeAirbagValues(values);
        setAirbagValues(normalizedValues);
        setCmdCounts({
          shoulder: normalizedValues.shoulder,
          sideWing: normalizedValues.sideWing,
          lumbar: normalizedValues.lumbar,
          hipFirm: normalizedValues.hipFirm,
          legRest: normalizedValues.legRest,
        });

      };

      // 1. 尝试从 SharedPreferences 读取（按体型）
      if (sm?.loadAirbagSettingsForShape && bodyShape) {
        try {
          const json = await sm.loadAirbagSettingsForShape(bodyShape);
          if (json) {
            const parsed = JSON.parse(json) as CustomAirbagValues;
            applyLoadedValues(parsed);
            AsyncStorage.setItem(storageKey, json).catch(() => {});
            setStorageLoaded(true);
            // if (__DEV__) console.log('[CustomAirbag] SP加载成功:', bodyShape, parsed);
            return;
          }
        } catch (e: any) {
          // if (__DEV__) console.warn('[CustomAirbag] SP加载失败:', e?.message || e);
        }
      }

      // 2. 尝试从 AsyncStorage 读取（按体型）
      try {
        const json = await AsyncStorage.getItem(storageKey);
        if (json) {
          const parsed = JSON.parse(json) as CustomAirbagValues;
          applyLoadedValues(parsed);
          if (sm?.saveAirbagSettingsForShape && bodyShape) {
            sm.saveAirbagSettingsForShape(bodyShape, json).catch(() => {});
          }
          setStorageLoaded(true);
          // if (__DEV__) console.log('[CustomAirbag] AS加载成功:', bodyShape, parsed);
          return;
        }
      } catch (e: any) {
          // if (__DEV__) console.warn('[CustomAirbag] AS加载失败:', e?.message || e);
      }


      setStorageLoaded(true);
    };

    loadSavedValues();
  }, []); // 只在挂载时执行一次
  const [modalType, setModalType] = useState<ModalType>(null);
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });
  const [cmdLogs, setCmdLogs] = useState<CmdLog[]>([]);
  const [showLog, setShowLog] = useState(false);
  // 正视座椅:点 开/关、发光 开/关(接在座状态:在座亮/离座灭;测试按钮仍可手动覆盖)
  const [dotsOn, setDotsOn] = useState(false);
  const [glowOn, setGlowOn] = useState(false);
  // 逐部位闪烁信号:点某部位气囊 +/- 时,让对应部位闪一下
  const [flash, setFlash] = useState<{parts: any[]; seq: number} | null>(null);
  const flashSeqRef = useRef(0);
  const triggerFlash = useCallback((zone: string) => {
    const parts = AIRBAG_ZONE_TO_PARTS[zone];
    if (!parts) return;
    flashSeqRef.current += 1;
    setFlash({parts, seq: flashSeqRef.current});
  }, []);
  // 在座 → 点亮「点」，离座 → 关闭（与首页联动，仅点、不联动光）
  useEffect(() => {
    setDotsOn(seatStatus === 'seated');
  }, [seatStatus]);
  const logIdRef = useRef(0);
  const logScrollRef = useRef<ScrollView>(null);

  // ─── 座椅图自适应高度 ───
  // 使用屏幕高度的60%计算座椅图片的scale，保证图片足够大且标签不会被挤开
  const SCREEN_H = Dimensions.get('window').height;
  const SEAT_AREA_H = SCREEN_H * 0.6;
  const BASE_H = 327;
  const seatScale = SEAT_AREA_H / BASE_H;

  // ─── 1秒锁定机制 ───
  const [isLocked, setIsLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockProgressAnim = useRef(new Animated.Value(0)).current;
  // 记录锁定时操作的 zone，用于1秒后发送保压指令
  const lastCmdZoneRef = useRef<CustomAirbagZone | null>(null);

  // 每个气囊当前档位：0～3。加号升档，减号只能退回已经增加的档位。
  // ━━━ 同步初始化：用 initValues 作为初始值，确保首次渲染就显示上次保存的值 ━━━
  const [cmdCounts, setCmdCounts] = useState<Record<CustomAirbagZone, number>>({
    shoulder: initValues.shoulder,
    sideWing: initValues.sideWing,
    lumbar: initValues.lumbar,
    hipFirm: initValues.hipFirm,
    legRest: initValues.legRest,
  });

  const savingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 用 ref 始终保持最新的 airbagValues，避免闭包陈旧问题
  const airbagValuesRef = useRef<CustomAirbagValues>(airbagValues);
  useEffect(() => {
    airbagValuesRef.current = airbagValues;
  }, [airbagValues]);

  // 清理锁定定时器
  useEffect(() => {
    return () => {
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
      }
    };
  }, []);

  // 添加指令日志
  const addLog = useCallback(
    (zone: string, action: string, hex: string, bytes: number) => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now
        .getMilliseconds()
        .toString()
        .padStart(3, '0')}`;
      logIdRef.current += 1;
      setCmdLogs(prev => {
        const newLogs = [
          ...prev,
          {
            id: logIdRef.current,
            time,
            zone: ZONE_LABELS[zone] || zone,
            action,
            hex,
            bytes,
          },
        ];
        if (newLogs.length > MAX_LOG_LINES) {
          return newLogs.slice(-MAX_LOG_LINES);
        }
        return newLogs;
      });
      // 使用 requestAnimationFrame 代替 setTimeout 减少滚动开销
      requestAnimationFrame(() => {
        logScrollRef.current?.scrollToEnd({animated: false});
      });
    },
    [],
  );

  // 关闭页面时：下发 mode=5(关自适应)，与首页手动点「关闭自适应」一致，
  // 使算法退出品味模式(mode=1)、停在关闭态，UI 开关显示「关闭」即与算法一致。
  const handleClose = useCallback(() => {
    // console.log('[自适应下发] mode=5(关) 触发=自定义弹窗点关闭');
    sm?.pulseFrontCmd?.(5, 0, 0).catch(() => {});
    onClose();
  }, [onClose]);

  // 保存成功时恢复算法模式，并将当前气囊值回传给 App 层
  // 同时写入 SharedPreferences + AsyncStorage 双重保障
  const handleSaveAndRestore = useCallback(async () => {
    // 保存收尾:关自适应(mode=5),与 App 层保存后把开关置「关闭」对齐。
    // 距 handleConfirmSave 的 mode=2 已隔 5s,单槽脉冲不会互相覆盖。
    // console.log('[自适应下发] mode=5(关) 触发=保存后关自适应');
    sm?.pulseFrontCmd?.(5, 0, 0).catch(() => {});
    const latestValues = airbagValuesRef.current;
    const jsonStr = JSON.stringify(latestValues);

    // 并行写入 SharedPreferences + AsyncStorage，等待两者都完成
    const saveResults: {sp: boolean; as: boolean} = {sp: false, as: false};

    // 1. 写入 SharedPreferences（Native 层，按体型）
    if (sm?.saveAirbagSettingsForShape && bodyShape) {
      try {
        await sm.saveAirbagSettingsForShape(bodyShape, jsonStr);
        saveResults.sp = true;
        // if (__DEV__) console.log('[AirbagStorage] SP保存成功:', bodyShape);
      } catch (e: any) {
        // if (__DEV__) console.warn('[AirbagStorage] SP保存失败:', e?.message || e);
      }
    }

    // 2. 写入 AsyncStorage（JS 层兑底，按体型）
    try {
      await AsyncStorage.setItem(storageKey, jsonStr);
      saveResults.as = true;
      // if (__DEV__) console.log('[AirbagStorage] AS保存成功:', bodyShape, 'key:', storageKey);
    } catch (e: any) {
      // if (__DEV__) console.warn('[AirbagStorage] AS保存失败:', e?.message || e);
    }

    // 保存后回读验证已移除（性能优化，减少不必要的 IO 操作）

    // 回传给 App 层（更新内存状态 + 返回首页）
    onSaveSuccess(latestValues);
  }, [onSaveSuccess]);

  // 监听 Native 端发送的气囊指令事件
  useEffect(() => {
    if (!sm || !serialEmitter) {
      return;
    }
    const sub = serialEmitter.addListener('onAirbagCommandSent', (event: any) => {
      addLog(
        event.zone || '',
        event.action || '',
        event.hex || '',
        event.bytes || 0,
      );
    });
    return () => sub.remove();
  }, [addLog]);

  // 监听51字节回传指令，解析气囊充放气状态
  useEffect(() => {
    if (!sm || !serialEmitter) {
      return;
    }
    const sub = serialEmitter.addListener('onNonStandardFrame', (event: any) => {
      try {
        const csv = event?.data;
        if (!csv || typeof csv !== 'string') return;
        const bytes = csv.split(',').map((s: string) => parseInt(s.trim(), 10));
        if (bytes.length >= 21) {
          const newStates = parseAirbagCommand(bytes);
          setCommandStates(newStates);
        }
      } catch (e) {
        // 静默忽略解析错误
      }
    });
    return () => sub.remove();
  }, []);

  // 发送气囊控制指令
  const sendAirbagCmd = useCallback(
    async (zone: CustomAirbagZone, action: 'inflate' | 'deflate' | 'stop') => {
      if (!sm?.sendAirbagCommand) {
        // if (__DEV__) console.warn('[AirbagCmd] sendAirbagCommand not available');
        addLog(zone, action, 'N/A (模块不可用)', 0);
        return;
      }
      try {
        await sm.sendAirbagCommand(zone, action);
      } catch (e: any) {
        // if (__DEV__) console.warn('[AirbagCmd] Error:', e?.message || e);
        addLog(zone, `${action}(失败)`, e?.message || 'error', 0);
      }
    },
    [addLog],
  );

  // ─── 锁定按钮 + 1秒后保压 ───
  const startLockAndHoldPressure = useCallback(
    (zone: CustomAirbagZone) => {
      // 清除之前的定时器
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }

      // 记录当前操作的 zone
      lastCmdZoneRef.current = zone;

      // 锁定所有按钮
      setIsLocked(true);

      // 根据气囊区域获取锁定时长
      const duration = getLockDuration(zone);

      // 启动进度条动画（0 → 1，持续 duration）
      lockProgressAnim.setValue(0);
      Animated.timing(lockProgressAnim, {
        toValue: 1,
        duration: duration,
        useNativeDriver: false,
      }).start();

      // duration 后仅解锁（frontCmd 模式下动作时长由算法管理，不需手动发保压）
      lockTimerRef.current = setTimeout(() => {
        setIsLocked(false);
        lockTimerRef.current = null;
        lastCmdZoneRef.current = null;
      }, duration);
    },
    [lockProgressAnim],
  );

  // 选择气囊区域
  const handleSelectZone = useCallback(
    (zone: CustomAirbagZone) => {
      if (isLocked) {
        return; // 锁定期间不允许切换
      }
      setSelectedZone(zone);
    },
    [isLocked],
  );

  // 增加气囊值（充气）
  const handleIncrease = useCallback(() => {
    if (!selectedZone || isLocked) {
      return;
    }
    // 最多加 MAX_VALUE 次
    if (cmdCounts[selectedZone] >= MAX_VALUE) {
      return;
    }
    setAirbagValues(prev => {
      const newVal = prev[selectedZone] + 1;

      return {...prev, [selectedZone]: newVal};
    });
    setCmdCounts(prev => ({...prev, [selectedZone]: prev[selectedZone] + 1}));
    // 发送 frontCmd 充气脉冲 [0, 部位, +1]（算法折进 frame[55] 下发；Kotlin 一帧后自动回零）
    // console.log(`[自适应下发] mode=0(部位) part=${ZONE_TO_PART[selectedZone]} dir=+1 触发=自定义充气`);
    sm?.pulseFrontCmd?.(0, ZONE_TO_PART[selectedZone] ?? 0, 1).catch(() => {});
    addLog(selectedZone, 'inflate', `frontCmd[0,${ZONE_TO_PART[selectedZone]},1]`, 0);
    triggerFlash(selectedZone); // 对应部位闪烁一下
    // 启动锁定（视觉进度，动作时长由算法管理）
    startLockAndHoldPressure(selectedZone);
    // 重置入座定时充气
    onManualAdjust?.();
  }, [selectedZone, isLocked, cmdCounts, addLog, startLockAndHoldPressure, onManualAdjust, triggerFlash]);

  // 减少气囊值（放气）
  const handleDecrease = useCallback(() => {
    if (!selectedZone || isLocked) {
      return;
    }
    // 0 档时不可继续减，避免出现负档位。
    if (cmdCounts[selectedZone] <= 0) {
      return;
    }
    setAirbagValues(prev => {
      const newVal = prev[selectedZone] - 1;

      return {...prev, [selectedZone]: newVal};
    });
    setCmdCounts(prev => ({...prev, [selectedZone]: prev[selectedZone] - 1}));
    // 发送 frontCmd 放气脉冲 [0, 部位, -1]
    // console.log(`[自适应下发] mode=0(部位) part=${ZONE_TO_PART[selectedZone]} dir=-1 触发=自定义放气`);
    sm?.pulseFrontCmd?.(0, ZONE_TO_PART[selectedZone] ?? 0, -1).catch(() => {});
    addLog(selectedZone, 'deflate', `frontCmd[0,${ZONE_TO_PART[selectedZone]},-1]`, 0);
    triggerFlash(selectedZone); // 对应部位闪烁一下
    // 启动锁定（视觉进度，动作时长由算法管理）
    startLockAndHoldPressure(selectedZone);
    // 重置入座定时充气
    onManualAdjust?.();
  }, [selectedZone, isLocked, cmdCounts, addLog, startLockAndHoldPressure, onManualAdjust, triggerFlash]);

  // 点击保存按钮
  const handleSavePress = useCallback(() => {
    setModalType('confirmSave');
  }, []);

  // 确认保存：调用 Python 品味记录 + 持久化保存
  const handleConfirmSave = useCallback(() => {
    setModalType('saving');

    // 从 cmdCounts 构建 airbag_ops 字典，传递给 Python 品味记录系统
    const buildOps = (count: number) => ({
      inflate: count > 0 ? count : 0,
      deflate: count < 0 ? -count : 0,
    });
    const airbagOps = JSON.stringify({
      lumbar: buildOps(cmdCounts.lumbar),
      side_wings_left: buildOps(cmdCounts.sideWing),
      side_wings_right: buildOps(cmdCounts.sideWing),
      leg_left: buildOps(cmdCounts.legRest),
      leg_right: buildOps(cmdCounts.legRest),
      hip: buildOps(cmdCounts.hipFirm),
    });

    // 新算法:保存品味 frontCmd [2,0,0]（保存当前五组调节量及阈值）
    // console.log('[自适应下发] mode=2(存) 触发=保存自定义');
    sm?.pulseFrontCmd?.(2, 0, 0)?.catch?.(() => {});
    // 兼容旧 Python 品味记录（新算法不走此路，保留不影响）
    sm?.triggerPreferenceRecording?.(bodyShape || null, airbagOps)?.catch?.(() => {});

    savingTimerRef.current = setTimeout(() => {
      setModalType(null);
      handleSaveAndRestore();
    }, 5000);
  }, [handleSaveAndRestore, cmdCounts, bodyShape]);

  // 取消保存
  const handleCancelSaving = useCallback(() => {
    if (savingTimerRef.current) {
      clearTimeout(savingTimerRef.current);
      savingTimerRef.current = null;
    }
    setModalType(null);
  }, []);

  // 点击恢复默认
  const handleRestorePress = useCallback(() => {
    setModalType('confirmRestore');
  }, []);

  // 确认恢复默认
  const handleConfirmRestore = useCallback(() => {

    setModalType(null);
    setAirbagValues({...DEFAULT_CUSTOM_AIRBAG_VALUES});
    setSelectedZone('lumbar');
    setCmdCounts({
      shoulder: 0,
      sideWing: 0,
      lumbar: 0,
      hipFirm: 0,
      legRest: 0,
    });
    // 新算法:清除品味记忆 frontCmd [4,0,0]（清记忆并排空 1~10 号支撑气囊）
    // console.log('[自适应下发] mode=4(清) 触发=恢复默认/清记忆');
    sm?.pulseFrontCmd?.(4, 0, 0)?.catch?.(() => {});
    // 恢复默认时清除当前体型的本地缓存
    AsyncStorage.removeItem(storageKey).catch(() => {});
    if (sm?.saveAirbagSettingsForShape && bodyShape) {
      sm.saveAirbagSettingsForShape(bodyShape, JSON.stringify(DEFAULT_CUSTOM_AIRBAG_VALUES)).catch(() => {});
    }
    // 恢复默认时清除品味系数
    sm?.clearPreference?.(bodyShape || null)?.catch?.(() => {});
    // 恢复默认后关自适应(mode=5)。mode=4 与 mode=5 都是单槽脉冲,同 tick 连发会互相
    // 覆盖(mode=4 清记忆会失效),故延时 400ms,等 mode=4 那帧被取走后再发 mode=5。
    setTimeout(() => {
      // console.log('[自适应下发] mode=5(关) 触发=恢复默认后关自适应');
      sm?.pulseFrontCmd?.(5, 0, 0).catch(() => {});
    }, 400);
    // 恢复默认后直接关闭弹窗，回传默认值给 App 层
    onSaveSuccess({...DEFAULT_CUSTOM_AIRBAG_VALUES});
  }, [sendAirbagCmd, onSaveSuccess]);

  // 点击归零按钮
  const handleResetPress = useCallback(() => {
    setModalType('confirmReset');
  }, []);

  // 确认归零：将所有气囊值重置为 0，清除本地缓存，发送停止指令
  const handleConfirmReset = useCallback(async () => {

    setModalType(null);

    // 1. 重置 UI 状态
    const zeroValues = {...DEFAULT_CUSTOM_AIRBAG_VALUES};
    setAirbagValues(zeroValues);
    setCmdCounts({
      shoulder: 0,
      sideWing: 0,
      lumbar: 0,
      hipFirm: 0,
      legRest: 0,
    });
    setSelectedZone('lumbar');

    // 2. 发送停止指令给所有气囊
    AIRBAG_ZONES.forEach(z => sendAirbagCmd(z.key, 'stop'));

    // 3. 清除当前体型的本地缓存（同时写入全零值到存储）
    const zeroJson = JSON.stringify(zeroValues);
    await AsyncStorage.setItem(storageKey, zeroJson).catch(() => {});
    if (sm?.saveAirbagSettingsForShape && bodyShape) {
      sm.saveAirbagSettingsForShape(bodyShape, zeroJson).catch(() => {});
    }

    setToast({
      visible: true,
      message: '已归零所有气囊参数，所有气囊已停止',
      type: 'info',
    });
  }, [sendAirbagCmd]);

  // 隐藏 Toast
  const hideToast = useCallback(() => {
    setToast(prev => ({...prev, visible: false}));
  }, []);

  // 清空日志
  const clearLogs = useCallback(() => {
    setCmdLogs([]);
  }, []);

  // 清空操作总和
  const resetCounts = useCallback(() => {
    setCmdCounts({
      shoulder: 0,
      sideWing: 0,
      lumbar: 0,
      hipFirm: 0,
      legRest: 0,
    });
  }, []);

  // 计算总操作数（useMemo 避免每次渲染重新计算）
  const totalOps = useMemo(
    () => ALL_CUSTOM_AIRBAG_ZONES.reduce((sum, z) => sum + Math.abs(cmdCounts[z]), 0),
    [cmdCounts],
  );

  // 获取左侧和右侧的气囊区域（静态数据，useMemo 缓存）
  const leftZones = useMemo(() => AIRBAG_ZONES.filter(z => z.side === 'left'), []);
  const rightZones = useMemo(() => AIRBAG_ZONES.filter(z => z.side === 'right'), []);

  const currentValue = selectedZone ? airbagValues[selectedZone] : 0;

  // 锁定进度条宽度插值
  const lockProgressWidth = lockProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>

      <View style={styles.mainContent}>
        {/* 标题栏 */}
        <View style={styles.titleBar}>
          <View style={styles.titleLeft}>
            <Text style={styles.title}>自定义气囊调节</Text>
            {/* 锁定状态指示 */}
            {isLocked && (
              <View style={styles.lockBadge}>
                <View style={styles.lockDot} />
                <Text style={styles.lockText}>保压中...</Text>
              </View>
            )}
          </View>
          <View style={styles.titleRight}>
            {/* 点/光 开关(测试用;以后接数据) */}
            <TouchableOpacity
              style={[styles.logToggle, dotsOn && styles.logToggleActive]}
              onPress={() => setDotsOn(v => !v)}
              activeOpacity={0.7}>
              <Text style={[styles.logToggleText, dotsOn && styles.logToggleTextActive]}>
                {dotsOn ? '点关闭' : '点开启'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logToggle, glowOn && styles.logToggleActive]}
              onPress={() => setGlowOn(v => !v)}
              activeOpacity={0.7}>
              <Text style={[styles.logToggleText, glowOn && styles.logToggleTextActive]}>
                {glowOn ? '光关闭' : '光开启'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logToggle, showLog && styles.logToggleActive]}
              onPress={() => setShowLog(!showLog)}
              activeOpacity={0.7}>
              <Text
                style={[
                  styles.logToggleText,
                  showLog && styles.logToggleTextActive,
                ]}>
                {showLog ? '隐藏日志' : '显示日志'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              activeOpacity={0.7}>
              <View style={styles.closeIcon}>
                <View style={[styles.closeLine, styles.closeLine1]} />
                <View style={[styles.closeLine, styles.closeLine2]} />
              </View>
            </TouchableOpacity>
          </View>
          {/* 锁定进度条（绝对定位在标题栏底部，不占空间） */}
          {isLocked && (
            <View style={styles.lockProgressBar}>
              <Animated.View
                style={[
                  styles.lockProgressFill,
                  {width: lockProgressWidth},
                ]}
              />
            </View>
          )}
        </View>

        {/* 主体内容 */}
        <View style={styles.bodyWrapper}>
          <View style={styles.body}>
            {/* 左侧 +/- 按钮 */}
            <View style={styles.adjustButtonsContainer}>
              <AdjustButtons
                onIncrease={handleIncrease}
                onDecrease={handleDecrease}
                canIncrease={!selectedZone ? false : cmdCounts[selectedZone] < MAX_VALUE}
                canDecrease={!selectedZone ? false : cmdCounts[selectedZone] > 0}
                disabled={!selectedZone || isLocked}
              />
              {/* 锁定遮罩层提示 */}
              {isLocked && (
                <View style={styles.lockOverlay} />
              )}
            </View>

            {/* 左侧标签（肩部、腰托、腿托） */}
            <View style={styles.leftLabels}>
              {leftZones.map(zone => (
                <View key={zone.key} style={{transform: [{translateY: LABEL_OFFSET_Y[zone.key] || 0}]}}>
                  <CustomAirbagLabel
                    zone={zone.key}
                    label={zone.label}
                    isActive={selectedZone === zone.key}
                    onPress={handleSelectZone}
                    lineDirection="left"
                    cmdCount={cmdCounts[zone.key]}
                  />
                </View>
              ))}
            </View>

            {/* 中间座椅图:正视座椅 + 点(开/关)+ 发光(淡入淡出) */}
            <View style={styles.seatContainer}>
              <SeatFront dotsOn={dotsOn} glowOn={glowOn} flash={flash} />
            </View>

            {/* 右侧标签（侧翼、臀部软硬度） */}
            <View style={styles.rightLabels}>
              {rightZones.map(zone => (
                <View key={zone.key} style={{transform: [{translateY: LABEL_OFFSET_Y[zone.key] || 0}]}}>
                  <CustomAirbagLabel
                    zone={zone.key}
                    label={zone.label}
                    isActive={selectedZone === zone.key}
                    onPress={handleSelectZone}
                    lineDirection="right"
                    cmdCount={cmdCounts[zone.key]}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* 右侧面板区域 */}
          {showLog && (
            <View style={styles.rightPanel}>
              {/* ─── 操作总和面板 ─── */}
              <View style={styles.summaryPanel}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>操作总和</Text>
                  <TouchableOpacity onPress={resetCounts} activeOpacity={0.7}>
                    <Text style={styles.summaryClearText}>清零</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.summaryBody}>
                  {ALL_CUSTOM_AIRBAG_ZONES.map(zone => {
                    const count = cmdCounts[zone];
                    const isPositive = count > 0;
                    const isNegative = count < 0;
                    const isZero = count === 0;
                    const barWidth = Math.min(Math.abs(count), 10);
                    const barPercent = (barWidth / 10) * 100;
                    const barColor = isPositive
                      ? '#58A6FF'
                      : isNegative
                      ? '#F0883E'
                      : 'transparent';

                    return (
                      <View key={zone} style={styles.summaryRow}>
                        <Text
                          style={[
                            styles.summaryZone,
                            selectedZone === zone && styles.summaryZoneActive,
                          ]}>
                          {ZONE_SHORT_LABELS[zone]}
                        </Text>
                        {/* 柱状图 */}
                        <View style={styles.summaryBarBg}>
                          {/* 中线 */}
                          <View style={styles.summaryBarCenter} />
                          {/* 正向条（向右） */}
                          {isPositive && (
                            <View
                              style={[
                                styles.summaryBarFill,
                                styles.summaryBarRight,
                                {
                                  width: `${barPercent / 2}%`,
                                  backgroundColor: barColor,
                                },
                              ]}
                            />
                          )}
                          {/* 负向条（向左） */}
                          {isNegative && (
                            <View
                              style={[
                                styles.summaryBarFill,
                                styles.summaryBarLeft,
                                {
                                  width: `${barPercent / 2}%`,
                                  backgroundColor: barColor,
                                },
                              ]}
                            />
                          )}
                        </View>
                        {/* 数值 */}
                        <Text
                          style={[
                            styles.summaryValue,
                            isPositive && styles.summaryValuePositive,
                            isNegative && styles.summaryValueNegative,
                            isZero && styles.summaryValueZero,
                          ]}>
                          {isPositive ? `+${count}` : count}
                        </Text>
                      </View>
                    );
                  })}
                  {/* 总操作数 */}
                  <View style={styles.summaryTotalRow}>
                    <Text style={styles.summaryTotalLabel}>总操作</Text>
                    <Text style={styles.summaryTotalValue}>{totalOps} 次</Text>
                  </View>
                </View>
              </View>

              {/* ─── 日志面板 ─── */}
              <View style={styles.logPanel}>
                <View style={styles.logHeader}>
                  <Text style={styles.logTitle}>串口指令日志</Text>
                  <TouchableOpacity onPress={clearLogs} activeOpacity={0.7}>
                    <Text style={styles.logClearText}>清空</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  ref={logScrollRef}
                  style={styles.logScroll}
                  showsVerticalScrollIndicator={true}>
                  {cmdLogs.length === 0 ? (
                    <Text style={styles.logEmpty}>暂无指令记录</Text>
                  ) : (
                    cmdLogs.map(log => (
                      <View key={log.id} style={styles.logItem}>
                        <Text style={styles.logTime}>{log.time}</Text>
                        <Text
                          style={[
                            styles.logAction,
                            log.action === 'inflate'
                              ? styles.logInflate
                              : log.action === 'deflate'
                              ? styles.logDeflate
                              : log.action === 'stop'
                              ? styles.logStop
                              : styles.logError,
                          ]}>
                          {log.action === 'inflate'
                            ? '充气'
                            : log.action === 'deflate'
                            ? '放气'
                            : log.action === 'stop'
                            ? '保压'
                            : log.action}
                        </Text>
                        <Text style={styles.logZone}>{log.zone}</Text>
                        <Text style={styles.logHex} numberOfLines={1}>
                          {log.hex}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        {/* 底部按钮 */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestorePress}
            activeOpacity={0.7}>
            <Text style={styles.restoreButtonText}>恢复默认</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSavePress} activeOpacity={0.8}>
            <LinearGradient
              colors={['#559BEA', '#2978CE']}
              start={{x: 0, y: 0}}
              end={{x: 1, y: 1}}
              style={styles.saveButton}>
              <Text style={styles.saveButtonText}>保存</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
      </View>

      {/* Toast */}
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />

      {/* 确认保存弹窗 */}
      <ConfirmModal
        visible={modalType === 'confirmSave'}
        title="确认保存自定义参数？"
        description='保存后将应用当前座椅气囊设置，并覆盖本次调整前的参数。如需恢复，可在"恢复默认"中一键还原。'
        cancelText="取消"
        confirmText="保存"
        onCancel={() => setModalType(null)}
        onConfirm={handleConfirmSave}
      />

      {/* 确认恢复默认弹窗 */}
      <ConfirmModal
        visible={modalType === 'confirmRestore'}
        title="确认恢复默认参数？"
        description="恢复后将覆盖当前自定义参数，未保存的调整不会保留。"
        cancelText="取消"
        confirmText="恢复默认"
        onCancel={() => setModalType(null)}
        onConfirm={handleConfirmRestore}
      />

      {/* 确认归零弹窗 */}
      <ConfirmModal
        visible={modalType === 'confirmReset'}
        title="确认归零所有气囊？"
        description="归零后所有气囊参数将重置为 0，并清除已保存的设置。此操作不可撤销。"
        cancelText="取消"
        confirmText="确认归零"
        onCancel={() => setModalType(null)}
        onConfirm={handleConfirmReset}
      />

      {/* 正在保存弹窗 */}
      <SavingModal
        visible={modalType === 'saving'}
        onCancel={handleCancelSaving}
      />

      {/* 进入弹窗时:气囊放气恢复初始状态 Loading 覆盖层(5秒,盖在最上层) */}
      {initLoading && (
        <View style={loadingStyles.overlay}>
          <ModalCard style={loadingStyles.card}>
            <LoadingSpinner />
            <Text style={loadingStyles.title}>Loading...</Text>
            <Text style={loadingStyles.subtitle}>
              气囊调节中，正在恢复初始状态，预计5秒完成。
            </Text>
          </ModalCard>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // 透明背景 → 弹窗周围完全露出后面的首页;内容居中,四边留距
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    // 居中浮层卡片:四边都留出距离(改这两个数=弹窗大小)
    width: '97%',
    height: '82%',
    backgroundColor: 'rgba(40, 44, 52, 0.98)',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  mainContent: {
    flex: 1,
    padding: Spacing.xxl,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  titleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textWhite,
  },
  // ─── 锁定状态指示 ───
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
    gap: 5,
  },
  lockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#58A6FF',
  },
  lockText: {
    fontSize: 12,
    color: '#58A6FF',
    fontWeight: '600',
  },
  // ─── 锁定进度条（绝对定位在标题栏底部，不占空间） ───
  lockProgressBar: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(88, 166, 255, 0.15)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  lockProgressFill: {
    height: '100%',
    backgroundColor: '#58A6FF',
    borderRadius: 1,
  },
  // ─── 锁定遮罩 ───
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockOverlayText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  logToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderGray,
  },
  logToggleActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0,122,255,0.1)',
  },
  logToggleText: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
  },
  logToggleTextActive: {
    color: Colors.primary,
  },
  closeButton: {
    // 去掉外圈:只保留点击区域,不画圆环边框
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    width: 11, // 叉号缩小(原 14)
    height: 11,
    position: 'relative',
  },
  closeLine: {
    position: 'absolute',
    width: 13, // 叉号线长缩短(原 16)
    height: 1.5,
    backgroundColor: Colors.textGray,
    top: 5,
    left: -1,
  },
  closeLine1: {
    transform: [{rotate: '45deg'}],
  },
  closeLine2: {
    transform: [{rotate: '-45deg'}],
  },
  bodyWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonsContainer: {
    marginRight: Spacing.xl,
    position: 'relative',
    alignSelf: 'center',
  },
  leftLabels: {
    justifyContent: 'space-around',
    height: 360,
    paddingRight: 0,
    position: 'relative',
    right: -120,
    zIndex: 1,
  },
  rightLabels: {
    justifyContent: 'space-around',
    height: 260,
    paddingLeft: 0,
    position: 'relative',
    left: -120,
    zIndex: 1,
  },
  seatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  // ─── 右侧面板 ───
  rightPanel: {
    width: 320,
    marginLeft: Spacing.lg,
    gap: Spacing.md,
  },
  // ─── 操作总和面板 ───
  summaryPanel: {
    backgroundColor: '#0D1117',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    padding: Spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGray,
  },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  summaryClearText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  summaryBody: {
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryZone: {
    fontSize: 12,
    color: '#8B949E',
    width: 36,
    fontWeight: '500',
  },
  summaryZoneActive: {
    color: '#58A6FF',
    fontWeight: '700',
  },
  summaryBarBg: {
    flex: 1,
    height: 14,
    backgroundColor: 'rgba(100, 120, 160, 0.12)',
    borderRadius: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  summaryBarCenter: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(150, 160, 180, 0.3)',
  },
  summaryBarFill: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    borderRadius: 3,
  },
  summaryBarRight: {
    left: '50%',
  },
  summaryBarLeft: {
    right: '50%',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
    fontFamily: 'monospace',
  },
  summaryValuePositive: {
    color: '#58A6FF',
  },
  summaryValueNegative: {
    color: '#F0883E',
  },
  summaryValueZero: {
    color: '#484F58',
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150, 160, 180, 0.15)',
  },
  summaryTotalLabel: {
    fontSize: 11,
    color: '#6E7681',
    fontWeight: '500',
  },
  summaryTotalValue: {
    fontSize: 12,
    color: '#C9D1D9',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  // ─── 日志面板 ───
  logPanel: {
    flex: 1,
    backgroundColor: '#0D1117',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    padding: Spacing.md,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGray,
  },
  logTitle: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.textWhite,
  },
  logClearText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
  },
  logScroll: {
    flex: 1,
  },
  logEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
    textAlign: 'center',
    marginTop: Spacing.xxl,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: Spacing.sm,
  },
  logTime: {
    fontSize: 11,
    color: '#8B949E',
    fontFamily: 'monospace',
    width: 80,
  },
  logAction: {
    fontSize: 11,
    fontWeight: '600',
    width: 32,
    textAlign: 'center',
  },
  logInflate: {
    color: '#58A6FF',
  },
  logDeflate: {
    color: '#F0883E',
  },
  logStop: {
    color: '#8B949E',
  },
  logError: {
    color: '#F85149',
  },
  logZone: {
    fontSize: 11,
    color: '#C9D1D9',
    width: 70,
  },
  logHex: {
    fontSize: 10,
    color: '#6E7681',
    fontFamily: 'monospace',
    flex: 1,
  },
  // ─── 底部按钮 ───
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    marginBottom: Spacing.lg,  // 整体往上挪一点
    paddingRight: Spacing.lg,  // 整体往左挪一点
  },
  restoreButton: {
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#606a76',
    backgroundColor: '#4b5867',
  },
  restoreButtonText: {
    fontSize: FontSize.xl,
    color: '#b4c0ca',
    fontWeight: '500',
  },
  resetButton: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#F0883E',
    backgroundColor: 'rgba(240, 136, 62, 0.1)',
  },
  resetButtonText: {
    fontSize: FontSize.md,
    color: '#F0883E',
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: Spacing.xxxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: FontSize.xl,
    color: Colors.textWhite,
    fontWeight: '500',
  },
});

// ─── 进入弹窗 Loading 覆盖层样式(白卡片) ───
const loadingStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    // 尺寸/背景/垂直居中由 ModalCard 提供(固定长宽 440×300、圆角 24、背景图)。这里只给左右内边距+水平居中。
    paddingHorizontal: 48,
    paddingBottom: 50, // 底部留白 → 内容(转圈图标+Loading...+说明)整体上移一点
    alignItems: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    marginBottom: 26,
  },
  dot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#2978CE',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8A8A',
    lineHeight: 20,
    textAlign: 'center',
  },
});

export default CustomAirbagScreen;
