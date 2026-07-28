import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { ChargingProvider } from './src/context/ChargingContext';
import AppNavigator from './src/navigation';
import BrandSplash from './src/components/BrandSplash';
import { FONT_ASSETS } from './src/constants/typography';
import { COLORS } from './src/constants/colors';

// Keep the native splash up until fonts are ready — no font-swap flash.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

export default function App() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);
  const [splashDone, setSplashDone] = useState(false);

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null; // native splash stays visible

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LanguageProvider>
            <AuthProvider>
              <ChargingProvider>
                <StatusBar style="auto" />
                <View style={{ flex: 1, backgroundColor: COLORS.background }}>
                  <AppNavigator />
                  {!splashDone && <BrandSplash onFinish={() => setSplashDone(true)} />}
                </View>
              </ChargingProvider>
            </AuthProvider>
          </LanguageProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
