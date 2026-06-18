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
});
