/**
 * Animation utilities for cross-platform compatibility
 * Powered by Nirvana
 */
import { Platform } from "react-native";

/**
 * Returns whether to use native driver for animations
 * Native driver is supported on iOS/Android but not on web
 */
export const useNativeDriver = Platform.OS !== 'web';

/**
 * Helper to get animation config with proper native driver setting
 */
export function getAnimationConfig<T extends { useNativeDriver?: boolean }>(
  config: T
): T {
  return {
    ...config,
    useNativeDriver: Platform.OS !== 'web',
  };
}
