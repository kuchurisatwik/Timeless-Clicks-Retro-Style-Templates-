import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Type declaration for Electron preload API
declare global {
  interface Window {
    electronAPI?: {
      getPictures: () => Promise<string[]>;
      onPicturesChanged: (callback: (photos: string[]) => void) => () => void;
      silentPrint: (dataUrl: string, printerName?: string) => Promise<{ success: boolean; error?: string }>;
      getPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>;
      updater: {
        check: () => void;
        download: () => void;
        install: () => void;
        getVersion: () => Promise<string>;
        onEvent: (callback: (event: { type: string; data?: any }) => void) => () => void;
      };
    };
  }
}

/**
 * Fetch all photos from available sources, sorted newest-first.
 */
export async function fetchPhotos(): Promise<string[]> {
  const allPhotos: string[] = [];

  // ─── Electron Desktop App ───
  if (window.electronAPI) {
    try {
      const electronPhotos = await window.electronAPI.getPictures();
      allPhotos.push(...electronPhotos);
    } catch (e) {
      console.warn('Could not fetch pictures from Electron IPC', e);
    }
  }
  // ─── Web (Vite dev server) ───
  else if (!Capacitor.isNativePlatform()) {
    try {
      const res = await fetch('/api/pictures');
      if (res.ok) {
        const pictureUrls: string[] = await res.json();
        allPhotos.push(...pictureUrls);
      }
    } catch (e) {
      console.warn('Could not fetch pictures from /api/pictures', e);
    }
  }

  // Also load any previously downloaded/stored photos from Preferences
  try {
    const { value } = await Preferences.get({ key: '@downloaded_photos' });
    if (value) {
      const parsed = JSON.parse(value);
      allPhotos.push(...parsed);
    }
  } catch (e) {
    console.warn('Could not load photos from Preferences', e);
  }

  return allPhotos;
}

/**
 * Subscribe to real-time photo changes.
 * Returns a cleanup function.
 */
export function subscribeToPhotoChanges(callback: (photos: string[]) => void): () => void {
  // ─── Electron: real-time IPC events ───
  if (window.electronAPI) {
    return window.electronAPI.onPicturesChanged(callback);
  }

  // ─── Web/Mobile: poll every 3 seconds ───
  let active = true;
  const poll = async () => {
    if (!active) return;
    const photos = await fetchPhotos();
    if (active) callback(photos);
  };
  const interval = setInterval(poll, 3000);
  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Get the display URL for a photo (handles Capacitor native file conversion).
 */
export function getDisplayUrl(url: string): string {
  return Capacitor.isNativePlatform() ? Capacitor.convertFileSrc(url) : url;
}
