import { useState, useEffect, useCallback } from 'react';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { toast } from 'sonner';

export function useAutostart() {
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    isEnabled()
      .then((enabled) => {
        if (mounted) setAutostartEnabled(enabled);
      })
      .catch((err) => {
        // Edge Case: Quietly handle if platform or environment does not support registry query
        console.debug('Failed to check autostart status:', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const toggleAutostart = useCallback(async () => {
    const nextState = !autostartEnabled;
    try {
      if (nextState) {
        await enable();
        setAutostartEnabled(true);
        toast.success('Автозапуск с Windows включен');
      } else {
        await disable();
        setAutostartEnabled(false);
        toast.info('Автозапуск с Windows отключен');
      }
    } catch (err) {
      // Edge Case: Autostart may be blocked by antivirus or registry policies
      console.warn('Autostart toggle failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Не удалось изменить автозапуск: ${msg}`);
      try {
        const actual = await isEnabled();
        setAutostartEnabled(actual);
      } catch {
        // ignore
      }
    }
  }, [autostartEnabled]);

  return { autostartEnabled, isLoading, toggleAutostart };
}
