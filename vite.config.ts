import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { IncomingMessage, ServerResponse } from 'http'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

// Custom plugin to handle saving templates to disk
const templateSaverPlugin = () => {
  return {
    name: 'template-saver',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (req.url === '/api/save-template' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const { templateId, html } = JSON.parse(body);
              if (templateId && html) {
                const filePath = path.resolve(__dirname, `public/templates/${templateId}/template.html`);
                fs.writeFileSync(filePath, html, 'utf-8');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
                return;
              }
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e) }));
              return;
            }
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid request' }));
          });
        } else {
          next();
        }
      });
    }
  }
}

// Recursively collect image files from a directory
interface ImageFile {
  relativePath: string;
  mtimeMs: number;
}

const collectImages = (dir: string, baseDir: string): ImageFile[] => {
  const results: ImageFile[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectImages(fullPath, baseDir));
      } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        // Create a URL-safe relative path from the base Pictures directory
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        results.push({ relativePath, mtimeMs: stat.mtimeMs });
      }
    }
  } catch (e) {
    // Skip directories we can't read
  }
  return results;
};

// Resolve the system Pictures folder path
const getSystemPicturesDir = (): string => {
  const homeDir = os.homedir();

  // OneDrive-synced Pictures folder (common on Windows with OneDrive)
  const oneDrivePictures = path.join(homeDir, 'OneDrive', 'Pictures');
  if (fs.existsSync(oneDrivePictures)) return oneDrivePictures;

  // Standard Windows Pictures folder
  const standardPictures = path.join(homeDir, 'Pictures');
  if (fs.existsSync(standardPictures)) return standardPictures;

  // Fallback to project-local pictures/ folder
  return path.resolve(__dirname, 'pictures');
};

// Plugin to serve images from the system Pictures folder
const picturesApiPlugin = () => {
  let cachedImageFiles: string[] = [];
  let lastCacheTime = 0;
  const CACHE_DURATION_MS = 3000; // 3 seconds

  return {
    name: 'pictures-api',
    configureServer(server: ViteDevServer) {
      const picturesDir = getSystemPicturesDir();
      console.log(`[pictures-api] Serving images from: ${picturesDir}`);

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        // API endpoint: return JSON list of image file URLs (recursive)
        if (req.url === '/api/pictures' && req.method === 'GET') {
          try {
            const now = Date.now();
            if (now - lastCacheTime > CACHE_DURATION_MS) {
              const allImages = collectImages(picturesDir, picturesDir);
              allImages.sort((a, b) => b.mtimeMs - a.mtimeMs); // Sort newest first
              cachedImageFiles = allImages
                .map(img => `/pictures/${encodeURIComponent(img.relativePath)}`);
              lastCacheTime = now;
            }
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(cachedImageFiles));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(e) }));
          }
          return;
        }

        // Serve individual picture files from /pictures/*
        if (req.url && req.url.startsWith('/pictures/')) {
          const relativePath = decodeURIComponent(req.url.replace('/pictures/', ''));
          const filePath = path.resolve(picturesDir, relativePath);

          // Security: prevent path traversal
          if (!filePath.startsWith(picturesDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.webp': 'image/webp',
              '.gif': 'image/gif',
              '.bmp': 'image/bmp',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.statusCode = 200;
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            return;
          }
        }

        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), templateSaverPlugin(), picturesApiPlugin()],
})
