import React, {useState, useCallback, useRef, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  NativeEventEmitter,
  ScrollView,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {
  TopBar,
  CustomSeatDiagram,
  CustomAirbagLabel,
  AdjustButtons,
  ConfirmModal,
  SavingModal,
  Toast,
} from '../components';
import IconFont from '../components/IconFont';
import type {
  CustomAirbagZone,
  CustomAirbagValues,
  CustomAirbagZoneConfig,
  ModalType,
  ConnectionStatus,
} from '../types';
import {DEFAULT_CUSTOM_AIRBAG_VALUES, ALL_CUSTOM_AIRBAG_ZONES} from '../types';

/** AsyncStorage 缓存 key */
const ASYNC_STORAGE_KEY = 'custom_airbag_values';

const sm = NativeModules.SerialModule;

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

const MAX_VALUE = 10;
const MIN_VALUE = 0;
const MAX_LOG_LINES = 50;

/** 锁定持续时间（毫秒） */
const LOCK_DURATION_MS = 1000;

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
}

const CustomAirbagScreen: React.FC<CustomAirbagScreenProps> = ({
  onClose,
  onSaveSuccess,
  initialValues,
  adaptiveEnabled = true,
}) => {
  const [connectionStatus] = useState<ConnectionStatus>('connected');
  const [selectedZone, setSelectedZone] = useState<CustomAirbagZone>('lumbar');

  // ━━━ 同步初始化：用 initialValues 作为初始值，确保首次渲染就有正确的值 ━━━
  const initValues = initialValues || DEFAULT_CUSTOM_AIRBAG_VALUES;
  console.log('[CustomAirbag] 同步初始化 initValues:', JSON.stringify(initValues));

  const [airbagValues, setAirbagValues] = useState<CustomAirbagValues>(initValues);
  const [storageLoaded, setStorageLoaded] = useState(false);

  // 异步兑底：从存储中读取，如果存储中的值与 initValues 不同则更新
  useEffect(() => {
    const loadSavedValues = async () => {
      console.log('[CustomAirbag] 开始异步加载已保存的气囊值...');

      // 加载成功后同时更新 airbagValues 和 cmdCounts
      const applyLoadedValues = (values: CustomAirbagValues) => {
        setAirbagValues(values);
        setCmdCounts({
          shoulder: values.shoulder,
          sideWing: values.sideWing,
          lumbar: values.lumbar,
          hipFirm: values.hipFirm,
          legRest: values.legRest,
        });
        console.log('[CustomAirbag] 异步加载已同步 cmdCounts:', JSON.stringify(values));
      };

      // 1. 尝试从 SharedPreferences 读取
      if (sm?.loadAirbagSettings) {
        try {
          const json = await sm.loadAirbagSettings();
          console.log('[CustomAirbag] SharedPreferences 返回:', json);
          if (json) {
            const parsed = JSON.parse(json) as CustomAirbagValues;
            const hasNonZero = Object.values(parsed).some(v => v !== 0);
            console.log('[CustomAirbag] SharedPreferences 解析结果:', JSON.stringify(parsed), '有非零值:', hasNonZero);
            applyLoadedValues(parsed);
            AsyncStorage.setItem(ASYNC_STORAGE_KEY, json).catch(() => {});
            setStorageLoaded(true);
            return;
          }
        } catch (e: any) {
          console.warn('[CustomAirbag] SharedPreferences 加载失败:', e?.message || e);
        }
      }

      // 2. 尝试从 AsyncStorage 读取
      try {
        const json = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
        if (json) {
          const parsed = JSON.parse(json) as CustomAirbagValues;
          console.log('[CustomAirbag] AsyncStorage 解析结果:', JSON.stringify(parsed));
          applyLoadedValues(parsed);
          if (sm?.saveAirbagSettings) {
            sm.saveAirbagSettings(json).catch(() => {});
          }
          setStorageLoaded(true);
          return;
        }
      } catch (e: any) {
        console.warn('[CustomAirbag] AsyncStorage 加载失败:', e?.message || e);
      }

      console.log('[CustomAirbag] 存储中无数据，使用同步初始化的值');
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
  const [showLog, setShowLog] = useState(true);
  const logIdRef = useRef(0);
  const logScrollRef = useRef<ScrollView>(null);

  // ─── 1秒锁定机制 ───
  const [isLocked, setIsLocked] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockProgressAnim = useRef(new Animated.Value(0)).current;
  // 记录锁定时操作的 zone，用于1秒后发送保压指令
  const lastCmdZoneRef = useRef<CustomAirbagZone | null>(null);

  // 每个气囊的累计操作次数（充气 +1，放气 -1）
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
      setTimeout(() => {
        logScrollRef.current?.scrollToEnd({animated: true});
      }, 50);
    },
    [],
  );

  // 关闭页面时恢复算法模式
  const handleClose = useCallback(() => {
    if (adaptiveEnabled) {
      sm?.setAlgoMode?.(true);
      console.log('[AlgoMode] 退出自定义气囊调节，自适应已开启，恢复算法模式');
    } else {
      console.log('[AlgoMode] 退出自定义气囊调节，自适应已关闭，保持算法模式关闭');
    }
    onClose();
  }, [adaptiveEnabled, onClose]);

  // 保存成功时恢复算法模式，并将当前气囊值回传给 App 层
  // 同时写入 SharedPreferences + AsyncStorage 双重保障
  const handleSaveAndRestore = useCallback(async () => {
    if (adaptiveEnabled) {
      sm?.setAlgoMode?.(true);
      console.log('[AlgoMode] 保存成功，自适应已开启，恢复算法模式');
    }
    const latestValues = airbagValuesRef.current;
    const jsonStr = JSON.stringify(latestValues);
    console.log('[AirbagStorage] ===== 开始保存 =====');
    console.log('[AirbagStorage] airbagValuesRef.current:', jsonStr);
    console.log('[AirbagStorage] 各区域值: 肩部=' + latestValues.shoulder + ' 侧翼=' + latestValues.sideWing + ' 腰托=' + latestValues.lumbar + ' 臀部=' + latestValues.hipFirm + ' 腿托=' + latestValues.legRest);

    // 并行写入 SharedPreferences + AsyncStorage，等待两者都完成
    const saveResults: {sp: boolean; as: boolean} = {sp: false, as: false};

    // 1. 写入 SharedPreferences（Native 层）
    if (sm?.saveAirbagSettings) {
      try {
        await sm.saveAirbagSettings(jsonStr);
        saveResults.sp = true;
        console.log('[AirbagStorage] SharedPreferences 保存成功');
      } catch (e: any) {
        console.warn('[AirbagStorage] SharedPreferences 保存失败:', e?.message || e);
      }
    } else {
      console.warn('[AirbagStorage] sm.saveAirbagSettings 不可用!');
    }

    // 2. 写入 AsyncStorage（JS 层兜底）
    try {
      await AsyncStorage.setItem(ASYNC_STORAGE_KEY, jsonStr);
      saveResults.as = true;
      console.log('[AirbagStorage] AsyncStorage 保存成功');
    } catch (e: any) {
      console.warn('[AirbagStorage] AsyncStorage 保存失败:', e?.message || e);
    }

    // 3. 保存后立即回读验证
    if (sm?.loadAirbagSettings) {
      try {
        const verifyJson = await sm.loadAirbagSettings();
        console.log('[AirbagStorage] 保存后回读验证 SharedPreferences:', verifyJson);
      } catch (e: any) {
        console.warn('[AirbagStorage] 回读验证失败:', e?.message || e);
      }
    }
    try {
      const verifyAsync = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
      console.log('[AirbagStorage] 保存后回读验证 AsyncStorage:', verifyAsync);
    } catch (e: any) {
      console.warn('[AirbagStorage] AsyncStorage 回读验证失败:', e?.message || e);
    }

    console.log('[AirbagStorage] 保存结果: SP=' + saveResults.sp + ' AS=' + saveResults.as);
    console.log('[AirbagStorage] ===== 保存完成，回传 App 层 =====');

    // 回传给 App 层（更新内存状态 + 返回首页）
    onSaveSuccess(latestValues);
  }, [adaptiveEnabled, onSaveSuccess]);

  // 监听 Native 端发送的气囊指令事件
  useEffect(() => {
    if (!sm) {
      return;
    }
    const emitter = new NativeEventEmitter(sm as never);
    const sub = emitter.addListener('onAirbagCommandSent', (event: any) => {
      addLog(
        event.zone || '',
        event.action || '',
        event.hex || '',
        event.bytes || 0,
      );
    });
    return () => sub.remove();
  }, [addLog]);

  // 发送气囊控制指令
  const sendAirbagCmd = useCallback(
    async (zone: CustomAirbagZone, action: 'inflate' | 'deflate' | 'stop') => {
      if (!sm?.sendAirbagCommand) {
        console.warn('[AirbagCmd] sendAirbagCommand not available');
        addLog(zone, action, 'N/A (模块不可用)', 0);
        return;
      }
      try {
        await sm.sendAirbagCommand(zone, action);
      } catch (e: any) {
        console.warn('[AirbagCmd] Error:', e?.message || e);
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

      // 启动进度条动画（0 → 1，持续 LOCK_DURATION_MS）
      lockProgressAnim.setValue(0);
      Animated.timing(lockProgressAnim, {
        toValue: 1,
        duration: LOCK_DURATION_MS,
        useNativeDriver: false,
      }).start();

      // 1秒后发送保压（stop）指令并解锁
      lockTimerRef.current = setTimeout(() => {
        const targetZone = lastCmdZoneRef.current;
        if (targetZone) {
          sendAirbagCmd(targetZone, 'stop');
          console.log(`[AirbagCmd] 1s保压: zone=${targetZone} action=stop`);
        }
        setIsLocked(false);
        lockTimerRef.current = null;
        lastCmdZoneRef.current = null;
      }, LOCK_DURATION_MS);
    },
    [sendAirbagCmd, lockProgressAnim],
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
    setAirbagValues(prev => {
      const newVal = prev[selectedZone] + 1;
      console.log('[AirbagValues] ' + selectedZone + ' +1 => ' + newVal);
      return {...prev, [selectedZone]: newVal};
    });
    setCmdCounts(prev => ({...prev, [selectedZone]: prev[selectedZone] + 1}));
    // 发送充气指令
    sendAirbagCmd(selectedZone, 'inflate');
    // 启动1秒锁定
    startLockAndHoldPressure(selectedZone);
  }, [selectedZone, isLocked, sendAirbagCmd, startLockAndHoldPressure]);

  // 减少气囊值（放气）
  const handleDecrease = useCallback(() => {
    if (!selectedZone || isLocked) {
      return;
    }
    setAirbagValues(prev => {
      const newVal = prev[selectedZone] - 1;
      console.log('[AirbagValues] ' + selectedZone + ' -1 => ' + newVal);
      return {...prev, [selectedZone]: newVal};
    });
    setCmdCounts(prev => ({...prev, [selectedZone]: prev[selectedZone] - 1}));
    // 发送放气指令
    sendAirbagCmd(selectedZone, 'deflate');
    // 启动1秒锁定
    startLockAndHoldPressure(selectedZone);
  }, [selectedZone, isLocked, sendAirbagCmd, startLockAndHoldPressure]);

  // 点击保存按钮
  const handleSavePress = useCallback(() => {
    setModalType('confirmSave');
  }, []);

  // 确认保存：调用 Python 品味记录 + 持久化保存
  const handleConfirmSave = useCallback(() => {
    setModalType('saving');

    // 调用 Python 的 trigger_preference_recording，让算法采集当前压力数据并记录品味
    if (sm?.triggerPreferenceRecording) {
      sm.triggerPreferenceRecording(null)
        .then((resultJson: string) => {
          try {
            const result = JSON.parse(resultJson);
            if (result.success) {
              console.log('[Preference] 品味记录已触发:', result);
            } else {
              console.warn('[Preference] 品味记录触发失败:', result.message || result.error);
            }
          } catch (e) {
            console.warn('[Preference] 解析品味记录结果失败:', e);
          }
        })
        .catch((e: any) => {
          console.warn('[Preference] 调用 triggerPreferenceRecording 失败:', e?.message || e);
        });
    }

    savingTimerRef.current = setTimeout(() => {
      setModalType(null);
      handleSaveAndRestore();
    }, 5000);
  }, [handleSaveAndRestore]);

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
    console.log('[AirbagStorage] 恢复默认值');
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
    AIRBAG_ZONES.forEach(z => sendAirbagCmd(z.key, 'stop'));
    // 恢复默认时清除本地缓存（下次进入将使用默认值）
    AsyncStorage.removeItem(ASYNC_STORAGE_KEY).catch(() => {});
    if (sm?.saveAirbagSettings) {
      sm.saveAirbagSettings(JSON.stringify(DEFAULT_CUSTOM_AIRBAG_VALUES)).catch(() => {});
    }
    setToast({
      visible: true,
      message: '已恢复默认参数，所有气囊已停止',
      type: 'info',
    });
  }, [sendAirbagCmd]);

  // 点击归零按钮
  const handleResetPress = useCallback(() => {
    setModalType('confirmReset');
  }, []);

  // 确认归零：将所有气囊值重置为 0，清除本地缓存，发送停止指令
  const handleConfirmReset = useCallback(async () => {
    console.log('[AirbagStorage] 归零操作');
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

    // 3. 清除本地缓存（同时写入全零值到存储）
    const zeroJson = JSON.stringify(zeroValues);
    try {
      await AsyncStorage.setItem(ASYNC_STORAGE_KEY, zeroJson);
      console.log('[AirbagStorage] 归零 AsyncStorage 写入成功');
    } catch (e: any) {
      console.warn('[AirbagStorage] 归零 AsyncStorage 写入失败:', e?.message || e);
    }
    if (sm?.saveAirbagSettings) {
      try {
        await sm.saveAirbagSettings(zeroJson);
        console.log('[AirbagStorage] 归零 SharedPreferences 写入成功');
      } catch (e: any) {
        console.warn('[AirbagStorage] 归零 SharedPreferences 写入失败:', e?.message || e);
      }
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

  // 计算总操作数
  const totalOps = ALL_CUSTOM_AIRBAG_ZONES.reduce(
    (sum, z) => sum + Math.abs(cmdCounts[z]),
    0,
  );

  // 获取左侧和右侧的气囊区域
  const leftZones = AIRBAG_ZONES.filter(z => z.side === 'left');
  const rightZones = AIRBAG_ZONES.filter(z => z.side === 'right');

  const currentValue = selectedZone ? airbagValues[selectedZone] : 0;

  // 锁定进度条宽度插值
  const lockProgressWidth = lockProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <TopBar connectionStatus={connectionStatus} />

      <View style={styles.mainContent}>
        {/* 标题栏 */}
        <View style={styles.titleBar}>
          <View style={styles.titleLeft}>
            <IconFont
              name="keshihuatiaojie"
              size={20}
              color={Colors.textWhite}
            />
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
                canIncrease={true}
                canDecrease={true}
                disabled={!selectedZone || isLocked}
              />
              {/* 锁定遮罩层提示 */}
              {isLocked && (
                <View style={styles.lockOverlay}>
                  <Text style={styles.lockOverlayText}>1s</Text>
                </View>
              )}
            </View>

            {/* 左侧标签（肩部、腰托、腿托） */}
            <View style={styles.leftLabels}>
              {leftZones.map(zone => (
                <CustomAirbagLabel
                  key={zone.key}
                  zone={zone.key}
                  label={zone.label}
                  isActive={selectedZone === zone.key}
                  onPress={handleSelectZone}
                  lineDirection="left"
                  cmdCount={cmdCounts[zone.key]}
                />
              ))}
            </View>

            {/* 中间座椅图 */}
            <View style={styles.seatContainer}>
              <CustomSeatDiagram
                activeZone={selectedZone}
                scale={0.85}
                values={airbagValues}
              />
            </View>

            {/* 右侧标签（侧翼、臀部软硬度） */}
            <View style={styles.rightLabels}>
              {rightZones.map(zone => (
                <CustomAirbagLabel
                  key={zone.key}
                  zone={zone.key}
                  label={zone.label}
                  isActive={selectedZone === zone.key}
                  onPress={handleSelectZone}
                  lineDirection="right"
                  cmdCount={cmdCounts[zone.key]}
                />
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
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetPress}
            activeOpacity={0.7}>
            <Text style={styles.resetButtonText}>归零</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSavePress}
            activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>保存</Text>
          </TouchableOpacity>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mainContent: {
    flex: 1,
    backgroundColor: Colors.surfaceBackground,
    marginHorizontal: Spacing.xxl,
    marginBottom: Spacing.lg,
    borderRadius: BorderRadius.xl,
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
    borderRadius: BorderRadius.lg,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.textGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIcon: {
    width: 14,
    height: 14,
    position: 'relative',
  },
  closeLine: {
    position: 'absolute',
    width: 16,
    height: 1.5,
    backgroundColor: Colors.textGray,
    top: 6,
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
    paddingRight: Spacing.xl,
    position: 'relative',
  },
  leftLabels: {
    justifyContent: 'space-around',
    height: 280,
    paddingRight: Spacing.sm,
  },
  rightLabels: {
    justifyContent: 'space-around',
    height: 200,
    paddingLeft: Spacing.sm,
  },
  seatContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
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
  },
  restoreButton: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderGray,
    backgroundColor: Colors.transparent,
  },
  restoreButtonText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
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
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.buttonBlue,
  },
  saveButtonText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '500',
  },
});

export default CustomAirbagScreen;
