import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Custom plugin to handle saving templates to disk
const templateSaverPlugin = () => {
  return {
    name: 'template-saver',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/save-template' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), templateSaverPlugin()],
})
