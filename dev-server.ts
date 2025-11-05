// file: dev-server.ts
// description: Bun development server with hot module reloading
// reference: https://bun.sh/docs/api/http

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

console.log('🦆 Starting Duck-UI development server with Bun...');

// Ensure dist directory exists and build CSS on startup
if (!existsSync('./dist')) {
  mkdirSync('./dist', { recursive: true });
}

console.log('🎨 Building CSS for development...');
const cssResult = spawnSync('node', ['build-css.ts'], { stdio: 'inherit' });
if (cssResult.status !== 0) {
  console.error('⚠️  CSS build failed, continuing anyway...');
}

const server = Bun.serve({
  port: 5173,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname;

    // Serve index.html for root and SPA routes
    if (filePath === '/' || !filePath.includes('.')) {
      filePath = '/index.html';
    }

    // Handle public assets
    if (filePath.startsWith('/')) {
      const publicPath = `./public${filePath}`;
      const indexPath = './index.html';
      const srcPath = `.${filePath}`;

      try {
        // Try public directory first
        const file = Bun.file(publicPath);
        if (await file.exists()) {
          return new Response(file);
        }

        // Serve compiled CSS
        if (filePath === '/index.css') {
          const cssFile = Bun.file('./dist/index.css');
          if (await cssFile.exists()) {
            return new Response(cssFile, {
              headers: { 'Content-Type': 'text/css' },
            });
          }
        }

        // Try index.html for root
        if (filePath === '/index.html') {
          let html = await Bun.file(indexPath).text();

          // Inject CSS link and environment variables
          html = html.replace(
            '</head>',
            `<link rel="stylesheet" href="/index.css" />
            <script>
              window.__DUCK_UI_VERSION__ = ${JSON.stringify(pkg.version)};
              window.__DUCK_UI_RELEASE_DATE__ = ${JSON.stringify(pkg.release_date)};
              window.process = { env: ${JSON.stringify(process.env)} };
            </script></head>`
          );

          return new Response(html, {
            headers: { 'Content-Type': 'text/html' },
          });
        }

        // Try source files
        if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
          const srcFile = Bun.file(srcPath);
          if (await srcFile.exists()) {
            const transpiler = new Bun.Transpiler({
              loader: filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'ts',
              target: 'browser',
              define: {
                'import.meta.env.MODE': JSON.stringify('development'),
                'import.meta.env.PROD': 'false',
                'import.meta.env.DEV': 'true',
                '__DUCK_UI_VERSION__': JSON.stringify(pkg.version),
                '__DUCK_UI_RELEASE_DATE__': JSON.stringify(pkg.release_date),
              }
            });

            const code = await transpiler.transform(await srcFile.text());
            return new Response(code, {
              headers: { 'Content-Type': 'application/javascript' },
            });
          }
        }

        return new Response('Not Found', { status: 404 });
      } catch (error) {
        console.error('Error serving file:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
  error(error) {
    console.error('Server error:', error);
    return new Response('Internal Server Error', { status: 500 });
  },
});

console.log(`✅ Development server running at http://localhost:${server.port}`);
