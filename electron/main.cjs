const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

// ─── State ─────────────────────────────────────────
let mainWindow = null;
let picturesDir = '';
let watcher = null;

// Map: relativePath -> { relativePath, mtimeMs }
const imageIndex = new Map();

// ─── Helpers ───────────────────────────────────────
function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function getSortedImageList() {
  const images = Array.from(imageIndex.values());
  images.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
  return images.map(img => `pictures://${img.relativePath}`);
}

function addImageToIndex(filePath) {
  if (!isImageFile(filePath)) return false;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    const relativePath = path.relative(picturesDir, filePath).replace(/\\/g, '/');
    imageIndex.set(relativePath, { relativePath, mtimeMs: stat.mtimeMs });
    return true;
  } catch {
    return false;
  }
}

function removeImageFromIndex(filePath) {
  if (!isImageFile(filePath)) return false;
  const relativePath = path.relative(picturesDir, filePath).replace(/\\/g, '/');
  return imageIndex.delete(relativePath);
}

// ─── Initial scan ──────────────────────────────────
function scanDirectory(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        addImageToIndex(fullPath);
      }
    }
  } catch {
    // Skip directories we can't read
  }
}

// ─── File watcher ──────────────────────────────────
function startWatching() {
  picturesDir = app.getPath('pictures');
  console.log(`[Timeless Clicks] Pictures folder: ${picturesDir}`);

  // Initial scan
  scanDirectory(picturesDir);
  console.log(`[Timeless Clicks] Found ${imageIndex.size} images`);

  // Watch for changes
  watcher = chokidar.watch(picturesDir, {
    ignored: /(^|[\/\\])\../,  // ignore dotfiles
    persistent: true,
    ignoreInitial: true,       // we already scanned
    depth: 99,                 // recursive
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  // Debounce notifications to avoid flooding the renderer
  let notifyTimeout = null;
  const notifyChanged = () => {
    if (notifyTimeout) clearTimeout(notifyTimeout);
    notifyTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pictures:changed', getSortedImageList());
      }
    }, 300);
  };

  watcher
    .on('add', (filePath) => {
      if (addImageToIndex(filePath)) {
        console.log(`[Timeless Clicks] New image: ${path.basename(filePath)}`);
        notifyChanged();
      }
    })
    .on('change', (filePath) => {
      if (addImageToIndex(filePath)) {
        notifyChanged();
      }
    })
    .on('unlink', (filePath) => {
      if (removeImageFromIndex(filePath)) {
        console.log(`[Timeless Clicks] Removed image: ${path.basename(filePath)}`);
        notifyChanged();
      }
    });
}

// ─── IPC handlers ──────────────────────────────────
function setupIPC() {
  ipcMain.handle('pictures:get-list', () => {
    return getSortedImageList();
  });
}

// ─── Custom protocol: pictures:// ──────────────────
function setupProtocol() {
  protocol.handle('pictures', (request) => {
    // URL format: pictures://relative/path/to/image.jpg
    // Remove the "pictures://" prefix to get the relative path
    // Electron's request.url might have a trailing slash if it's considered an authority, 
    // but typically it's just pictures://...
    let relativePath = request.url.slice('pictures://'.length);
    // Decode URI-encoded characters
    relativePath = decodeURIComponent(relativePath);
    const filePath = path.join(picturesDir, relativePath);

    // Security: prevent path traversal
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(picturesDir))) {
      return new Response('Forbidden', { status: 403 });
    }

    // Use pathToFileURL to ensure correct file:// URL formatting on Windows
    const { pathToFileURL } = require('url');
    return net.fetch(pathToFileURL(resolved).href);
  });
}

// ─── Window ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Timeless Clicks",
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.setMenuBarVisibility(false);

  // Load the built HTML file
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ─────────────────────────────────
app.whenReady().then(() => {
  setupProtocol();
  setupIPC();
  startWatching();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
