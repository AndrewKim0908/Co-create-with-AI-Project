import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `Co-Create AI.html` uses @babel/standalone (no build step) and loads
// `src/components/Sidebar.jsx` via <script type="text/babel" src="...">.
// Babel standalone fetches that file and transpiles it client-side, so
// Vite must serve it RAW — not pre-processed by @vitejs/plugin-react,
// which would inject `import { jsx } from 'react/jsx-runtime'` and break
// the script. The Vite-app version of Sidebar lives at `Sidebar.vite.jsx`
// and is unaffected by this rule.
const rawForBabelStandalone = () => ({
  name: 'raw-for-babel-standalone',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url) return next();
      const url = req.url.split('?')[0];
      if (url === '/src/components/Sidebar.jsx') {
        const filePath = path.join(__dirname, 'src/components/Sidebar.jsx');
        if (fs.existsSync(filePath)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [rawForBabelStandalone(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
