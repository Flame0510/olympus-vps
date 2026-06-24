'use client';
import { useState, useCallback } from 'react';

export function useScreenshot() {
  const [loading, setLoading] = useState(false);

  const takeScreenshot = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(document.body, {
        backgroundColor: '#0A0A0B',
        quality: 1,
        pixelRatio: window.devicePixelRatio || 1,
      });
      const a = document.createElement('a');
      a.download = 'olympus-' + new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.png';
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error('screenshot failed', e);
      alert('Screenshot failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return { loading, takeScreenshot };
}
