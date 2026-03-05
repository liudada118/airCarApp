import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StatusBar, View, StyleSheet, NativeModules } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from './theme';
import { HomeScreen, CustomAirbagScreen } from './screens';
import { Toast } from './components';
import type { ConnectionStatus, CustomAirbagValues } from './types';
import { DEFAULT_CUSTOM_AIRBAG_VALUES } from './types';

/** AsyncStorage 缓存 key，与 CustomAirbagScreen 保持一致 */
const ASYNC_STORAGE_KEY = 'custom_airbag_values';

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

  // 持久化的气囊设置值
  const [savedAirbagValues, setSavedAirbagValues] = useState<CustomAirbagValues | null>(null);
  const savedAirbagValuesRef = useRef<CustomAirbagValues | null>(null);

  // 应用启动时加载已保存的气囊设置
  // 优先级：SharedPreferences(Native) > AsyncStorage(JS层) > 默认值
  useEffect(() => {
    const loadSettings = async () => {
      // 1. 尝试从 SharedPreferences 加载
      if (sm?.loadAirbagSettings) {
        try {
          const json = await sm.loadAirbagSettings();
          if (json) {
            const parsed = JSON.parse(json) as CustomAirbagValues;
            setSavedAirbagValues(parsed);
            savedAirbagValuesRef.current = parsed;
            // 同步到 AsyncStorage 作为备份
            AsyncStorage.setItem(ASYNC_STORAGE_KEY, json).catch(() => {});
            console.log('[AirbagStorage] 从 SharedPreferences 加载气囊设置:', parsed);
            return;
          }
        } catch (e: any) {
          console.warn('[AirbagStorage] SharedPreferences 加载失败:', e?.message || e);
        }
      }

      // 2. SharedPreferences 无数据或失败，尝试从 AsyncStorage 加载
      try {
        const json = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
        if (json) {
          const parsed = JSON.parse(json) as CustomAirbagValues;
          setSavedAirbagValues(parsed);
          savedAirbagValuesRef.current = parsed;
          // 同步回 SharedPreferences
          if (sm?.saveAirbagSettings) {
            sm.saveAirbagSettings(json).catch(() => {});
          }
          console.log('[AirbagStorage] 从 AsyncStorage 加载气囊设置:', parsed);
          return;
        }
      } catch (e: any) {
        console.warn('[AirbagStorage] AsyncStorage 加载失败:', e?.message || e);
      }

      console.log('[AirbagStorage] 无已保存的气囊设置，使用默认值');
    };

    loadSettings();
  }, []);

  // 导航到自定义气囊调节页面
  const navigateToCustomize = useCallback(() => {
    setCurrentScreen('customAirbag');
  }, []);

  // 关闭自定义气囊调节页面，返回首页
  const navigateToHome = useCallback(() => {
    setCurrentScreen('home');
  }, []);

  // 保存成功后：更新内存 → 返回首页 → 显示 Toast
  // 注意：SharedPreferences + AsyncStorage 的写入已在 CustomAirbagScreen 中完成
  // 这里只需更新内存状态并切换页面
  const handleSaveSuccess = useCallback((values: CustomAirbagValues) => {
    // 更新内存中的保存值
    setSavedAirbagValues(values);
    savedAirbagValuesRef.current = values;

    console.log('[AirbagStorage] App 层已更新内存气囊值:', JSON.stringify(values));

    setCurrentScreen('home');
    setHomeToast({
      visible: true,
      message: '自定义气囊调节保存成功，并应用到当前座椅。',
      type: 'success',
    });
  }, []);

  const hideHomeToast = useCallback(() => {
    setHomeToast(prev => ({ ...prev, visible: false }));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {currentScreen === 'home' ? (
          <View style={styles.screenContainer}>
            <HomeScreen
              onNavigateToCustomize={navigateToCustomize}
              adaptiveEnabled={adaptiveEnabled}
              onAdaptiveChange={setAdaptiveEnabled}
              connectionStatus={connectionStatus}
              onConnectionStatusChange={setConnectionStatus}
            />
            {/* 首页级别的 Toast（保存成功后显示） */}
            <Toast
              visible={homeToast.visible}
              message={homeToast.message}
              type={homeToast.type}
              onHide={hideHomeToast}
            />
          </View>
        ) : (
          <CustomAirbagScreen
            onClose={navigateToHome}
            onSaveSuccess={handleSaveSuccess}
            initialValues={savedAirbagValues || undefined}
            adaptiveEnabled={adaptiveEnabled}
          />
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
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
});

export default App;
