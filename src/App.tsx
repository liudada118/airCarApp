import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar, View, StyleSheet, NativeModules } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from './theme';
import { HomeScreen, CustomAirbagScreen } from './screens';
import { Toast } from './components';
import type { ConnectionStatus, CustomAirbagValues, BodyShape } from './types';
import { DEFAULT_CUSTOM_AIRBAG_VALUES } from './types';

/** AsyncStorage 缓存 key 前缀，按体型分类存储 */
const ASYNC_STORAGE_KEY_PREFIX = 'custom_airbag_values_';
/** 旧的单一缓存 key（兼容迁移） */
const LEGACY_ASYNC_STORAGE_KEY = 'custom_airbag_values';

/** 根据体型获取 AsyncStorage key */
function getStorageKey(shape: BodyShape): string {
  return shape ? `${ASYNC_STORAGE_KEY_PREFIX}${shape}` : LEGACY_ASYNC_STORAGE_KEY;
}

const sm = NativeModules.SerialModule;

type Screen = 'home' | 'customAirbag';

/**
 * SHROOM 座椅气囊控制应用
 *
 * 页面导航:
 * - HomeScreen: 首页，显示座椅状态、气囊状态、3D座椅
 * - CustomAirbagScreen: 自定义气囊调节页面
 *
 * 气囊设置持久化:
 * - 通过 SerialModule 的 SharedPreferences 存储
 * - 保存时写入，进入自定义页面时读取
 *
 * 注意：HomeScreen 始终保持挂载（不卸载），避免 3D 模型重新加载。
 * 切换到自定义页面时，HomeScreen 通过 display:'none' 隐藏。
 */
const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [homeToast, setHomeToast] = useState({
    visible: false,
    message: '',
    type: 'success' as 'success' | 'info' | 'error',
  });

  // 当前体型（由 HomeScreen 算法回传更新）
  const [currentBodyShape, setCurrentBodyShape] = useState<BodyShape>('');
  const currentBodyShapeRef = useRef<BodyShape>('');

  // 持久化的气囊设置值（按体型分类）
  const [savedAirbagValues, setSavedAirbagValues] = useState<CustomAirbagValues | null>(null);
  const savedAirbagValuesRef = useRef<CustomAirbagValues | null>(null);

  // 入座定时充气重置函数（由 HomeScreen 注册）
  const resetSeatedInflateRef = useRef<(() => void) | null>(null);
  const handleRegisterResetSeatedInflate = useCallback((resetFn: () => void) => {
    resetSeatedInflateRef.current = resetFn;
  }, []);

  // 当体型变化时，加载对应体型的气囊设置
  const loadSettingsForShape = useCallback(async (shape: BodyShape) => {
    const storageKey = getStorageKey(shape);
    // console.log('[AirbagStorage] 加载体型缓存:', shape || '默认', 'key:', storageKey);

    // 1. 尝试从 SharedPreferences 加载（按体型）
    if (sm?.loadAirbagSettingsForShape && shape) {
      try {
        const json = await sm.loadAirbagSettingsForShape(shape);
        if (json) {
          const parsed = JSON.parse(json) as CustomAirbagValues;
          setSavedAirbagValues(parsed);
          savedAirbagValuesRef.current = parsed;
          AsyncStorage.setItem(storageKey, json).catch(() => {});
          // console.log('[AirbagStorage] SP加载成功:', shape, parsed);
          return;
        }
      } catch (_) {}
    }

    // 2. 尝试从 AsyncStorage 加载（按体型）
    try {
      const json = await AsyncStorage.getItem(storageKey);
      if (json) {
        const parsed = JSON.parse(json) as CustomAirbagValues;
        setSavedAirbagValues(parsed);
        savedAirbagValuesRef.current = parsed;
        if (sm?.saveAirbagSettingsForShape && shape) {
          sm.saveAirbagSettingsForShape(shape, json).catch(() => {});
        }
        // console.log('[AirbagStorage] AS加载成功:', shape, parsed);
        return;
      }
    } catch (_) {}

    // 3. 该体型无缓存，尝试从旧的单一缓存迁移
    if (shape) {
      try {
        const legacyJson = await AsyncStorage.getItem(LEGACY_ASYNC_STORAGE_KEY);
        if (legacyJson) {
          const parsed = JSON.parse(legacyJson) as CustomAirbagValues;
          setSavedAirbagValues(parsed);
          savedAirbagValuesRef.current = parsed;
          // console.log('[AirbagStorage] 从旧缓存迁移:', shape, parsed);
          return;
        }
      } catch (_) {}
    }

    // 4. 无任何缓存，使用默认值
    setSavedAirbagValues(null);
    savedAirbagValuesRef.current = null;
    // console.log('[AirbagStorage] 无缓存，使用默认值:', shape);
  }, []);

  // 应用启动时加载（兼容旧缓存）
  useEffect(() => {
    loadSettingsForShape(currentBodyShape);
  }, []);

  // 体型变化时重新加载对应缓存
  const handleBodyShapeChange = useCallback((shape: BodyShape) => {
    if (shape === currentBodyShapeRef.current) return;
    // console.log('[BodyShape] 体型变化:', currentBodyShapeRef.current, '->', shape);
    setCurrentBodyShape(shape);
    currentBodyShapeRef.current = shape;
    if (shape) {
      loadSettingsForShape(shape);
    }
  }, [loadSettingsForShape]);

  // 导航到自定义气囊调节页面（同时重置定时充气）
  const navigateToCustomize = useCallback(() => {
    resetSeatedInflateRef.current?.();
    setCurrentScreen('customAirbag');
  }, []);

  // 关闭自定义气囊调节页面，返回首页
  const navigateToHome = useCallback(() => {
    setCurrentScreen('home');
  }, []);

  // 保存成功后：更新内存 → 返回首页 → 显示 Toast
  const handleSaveSuccess = useCallback((values: CustomAirbagValues) => {
    setSavedAirbagValues(values);
    savedAirbagValuesRef.current = values;

    setCurrentScreen('home');
    const shapeLabel = currentBodyShapeRef.current
      ? ({'瘦小': '轻盈型', '中等': '均衡型', '高大': '稳健型'}[currentBodyShapeRef.current] || currentBodyShapeRef.current)
      : '';
    setHomeToast({
      visible: true,
      message: shapeLabel
        ? `「${shapeLabel}」自定义气囊调节保存成功，并应用到当前座椅。`
        : '自定义气囊调节保存成功，并应用到当前座椅。',
      type: 'success',
    });
  }, []);

  const hideHomeToast = useCallback(() => {
    setHomeToast(prev => ({ ...prev, visible: false }));
  }, []);

  const isHome = currentScreen === 'home';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* HomeScreen 始终挂载，通过 opacity+zIndex 控制显隐，避免 GL 上下文被销毁 */}
        <View
          style={[styles.screenLayer, { opacity: isHome ? 1 : 0, zIndex: isHome ? 1 : 0 }]}
          pointerEvents={isHome ? 'auto' : 'none'}
        >
          <HomeScreen
            onNavigateToCustomize={navigateToCustomize}
            adaptiveEnabled={adaptiveEnabled}
            onAdaptiveChange={setAdaptiveEnabled}
            connectionStatus={connectionStatus}
            onConnectionStatusChange={setConnectionStatus}
            onBodyShapeChange={handleBodyShapeChange}
            onRegisterResetSeatedInflate={handleRegisterResetSeatedInflate}
          />
          {/* 首页级别的 Toast（保存成功后显示） */}
          <Toast
            visible={homeToast.visible}
            message={homeToast.message}
            type={homeToast.type}
            onHide={hideHomeToast}
          />
        </View>

        {/* CustomAirbagScreen 仅在需要时挂载 */}
        {!isHome && (
          <View style={[styles.screenLayer, { zIndex: 2 }]}>
          <CustomAirbagScreen
            onClose={navigateToHome}
            onSaveSuccess={handleSaveSuccess}
            initialValues={savedAirbagValues || undefined}
            adaptiveEnabled={adaptiveEnabled}
            bodyShape={currentBodyShape}
            onManualAdjust={() => resetSeatedInflateRef.current?.()}
          />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default App;
