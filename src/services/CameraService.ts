import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

const CAMERA_IP = '192.168.1.2';
const CCAPI_BASE_URL = `http://${CAMERA_IP}:8080/ccapi/ver110`;
let isRunning = false;
let statusListeners: ((status: boolean) => void)[] = [];

export const isCameraAutomationRunning = () => isRunning;

export const addCameraStatusListener = (listener: (status: boolean) => void) => {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
};

const notifyStatus = () => {
  statusListeners.forEach(listener => listener(isRunning));
};

// Set to true to test the ingestion pipeline without the physical camera
export const MOCK_MODE = true;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getElectronFs = () => {
  if (typeof window !== 'undefined' && (window as any).require) {
    try {
      return (window as any).require('fs');
    } catch (e) {
      return null;
    }
  }
  return null;
};

const getElectronPath = () => {
  if (typeof window !== 'undefined' && (window as any).require) {
    try {
      return (window as any).require('path');
    } catch (e) {
      return null;
    }
  }
  return null;
};

const downloadPhotoInBackground = async (fullCameraUrl: string) => {
  try {
    console.log(`Phase 1: Downloading from ${fullCameraUrl}`);
    const filename = `timeless_${Date.now()}.jpg`;
    let fileUri = '';

    if (Capacitor.isNativePlatform()) {
      // Android / iOS via Capacitor
      const downloadResult = await Filesystem.downloadFile({
        url: fullCameraUrl,
        path: filename,
        directory: Directory.Documents,
      });
      fileUri = downloadResult.path || '';
    } else {
      // Windows / Electron or Web
      const fs = getElectronFs();
      const path = getElectronPath();
      if (fs && path) {
        // Node environment (Electron)
        const process = (window as any).process;
        const targetDir = path.join(process.cwd(), 'downloaded_photos');
        
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        
        const targetPath = path.join(targetDir, filename);
        
        // Fetch the file
        const res = await fetch(fullCameraUrl);
        const arrayBuffer = await res.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        fs.writeFileSync(targetPath, uint8Array);
        
        fileUri = `file://${targetPath.replace(/\\/g, '/')}`;
      } else {
        // Fallback for Web (Blob download)
        const res = await fetch(fullCameraUrl);
        const blob = await res.blob();
        fileUri = URL.createObjectURL(blob);
      }
    }

    if (fileUri) {
      // Log it into persistent storage
      const existingStr = await Preferences.get({ key: '@downloaded_photos' });
      const existing = existingStr.value ? JSON.parse(existingStr.value) : [];
      existing.unshift(fileUri);
      await Preferences.set({ key: '@downloaded_photos', value: JSON.stringify(existing) });

      console.log('Phase 1: Download Complete and Saved ->', fileUri);
    }
  } catch (err) {
    console.error('Phase 1 Error: Download failed:', err);
  }
};

export const pollCameraEvents = async (delayMs: number = 2000) => {
  while (isRunning) {
    try {
      if (MOCK_MODE) {
        console.log("Phase 1: [MOCK MODE] Simulating camera check...");
        // Simulate a photo click every 10 seconds (10000 ms) based on probability 
        // For heavy testing, we can simulate 20% chance every 2 seconds
        if (Math.random() > 0.8) {
          console.log("Phase 1: [MOCK MODE] Shutter Click Detected!");
          // Use a dummy image URL for mock download
          await downloadPhotoInBackground(`https://picsum.photos/1200/800`);
        }
      } else {
        const response = await fetch(`${CCAPI_BASE_URL}/event/polling?continue=on`, { 
          method: 'GET',
        });
        
        if (response.status === 200) {
          const data = await response.json();
          
          if (data.addedcontents && data.addedcontents.length > 0) {
            await downloadPhotoInBackground(`http://${CAMERA_IP}:8080${data.addedcontents[0]}`);
          }
        }
      }
    } catch (e) {
      // Intentionally quiet. Polling will fail often if the network drops temporarily.
    }
    
    // Pause before the next ping to prevent overloading the camera's CPU
    await sleep(delayMs);
  }
};

export const startCameraAutomation = async () => {
  if (isRunning) return;
  isRunning = true;
  notifyStatus();
  console.log("Phase 1: Background Polling Started.");

  if (Capacitor.isNativePlatform()) {
    // Enable background mode for Android
    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins && cordova.plugins.backgroundMode) {
      const bgMode = cordova.plugins.backgroundMode;
      bgMode.setDefaults({
        title: 'Timeless Clicks Active',
        text: 'Listening for Canon R50 shutter clicks...',
        icon: 'ic_launcher',
        color: '#FF4500',
        resume: true,
        hidden: false,
      });
      bgMode.enable();
      
      bgMode.on('activate', () => {
        bgMode.disableWebViewOptimizations();
      });
    }
  }

  // Start polling
  pollCameraEvents(2000);
};

export const stopCameraAutomation = async () => {
  isRunning = false;
  notifyStatus();
  console.log("Phase 1: Background Polling Stopped.");

  if (Capacitor.isNativePlatform()) {
    const cordova = (window as any).cordova;
    if (cordova && cordova.plugins && cordova.plugins.backgroundMode) {
      cordova.plugins.backgroundMode.disable();
    }
  }
};
