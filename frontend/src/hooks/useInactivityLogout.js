import { useEffect } from 'react';
import { supabase } from '../supabaseClient';

const TIMEOUT = 60 * 60 * 1000;

export function useInactivityLogout(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      }, TIMEOUT);
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer));

    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [enabled]);
}
