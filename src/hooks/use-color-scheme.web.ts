import { useEffect, useState } from 'react';
import { useThemePreference } from '../theme/ThemePreferenceContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  try {
    const { resolvedTheme } = useThemePreference();
    if (hasHydrated) {
      return resolvedTheme;
    }
  } catch (e) {}

  return 'light';
}
