import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import MainAppContent from './index';

export default function NotFoundScreen() {
  const router = useRouter();

  useEffect(() => {
    // Automatically replace unknown/subfolder route with root
    const timer = setTimeout(() => {
      try {
        router.replace('/');
      } catch (e) {
        console.warn('Navigation redirect fallback notice:', e);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return <MainAppContent />;
}
