const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Request the current sorted list of pictures
  getPictures: () => ipcRenderer.invoke('pictures:get-list'),

  // Listen for real-time file changes (add/remove/change)
  onPicturesChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('pictures:changed', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('pictures:changed', handler);
  },

  // Auto Mode Print APIs
  silentPrint: (dataUrl, printerName) => ipcRenderer.invoke('print:silent', dataUrl, printerName),
  getPrinters: () => ipcRenderer.invoke('printers:get'),

  // Updater APIs
  updater: {
    check: () => ipcRenderer.send('updater:check'),
    download: () => ipcRenderer.send('updater:download'),
    install: () => ipcRenderer.send('updater:install'),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    onEvent: (callback) => {
      const handler = (event, type, data) => callback({ type, data });
      
      // Wire up all updater channels
      const channels = [
        'updater:checking',
        'updater:update-available',
        'updater:update-not-available',
        'updater:error',
        'updater:download-progress',
        'updater:update-downloaded'
      ];

      const listeners = channels.map(channel => {
        const listener = (_e, data) => callback({ type: channel.replace('updater:', ''), data });
        ipcRenderer.on(channel, listener);
        return { channel, listener };
      });

      // Cleanup function
      return () => {
        listeners.forEach(({ channel, listener }) => {
          ipcRenderer.removeListener(channel, listener);
        });
      };
    }
  }
});
