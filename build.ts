// file: build.ts
// description: Bun build configuration for production builds
// reference: https://bun.sh/docs/bundler

import { readFileSync, cpSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

console.log('🦆 Building Duck-UI with Bun...');

// First, build CSS with Tailwind
console.log('🎨 Building CSS...');
const cssResult = spawnSync('node', ['build-css.ts'], { stdio: 'inherit' });
if (cssResult.status !== 0) {
  console.error('❌ CSS build failed');
  process.exit(1);
}

const result = await Bun.build({
  entrypoints: ['./src/main.tsx'],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  sourcemap: 'external',
  naming: {
    entry: '[dir]/[name].[hash].[ext]',
    chunk: '[name]-[hash].[ext]',
    asset: 'assets/[name]-[hash].[ext]'
  },
  define: {
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env.PROD': 'true',
    'import.meta.env.DEV': 'false',
    '__DUCK_UI_VERSION__': JSON.stringify(pkg.version),
    '__DUCK_UI_RELEASE_DATE__': JSON.stringify(pkg.release_date),
    // Add any environment variables from process.env
    ...Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('VITE_') || key.startsWith('PUBLIC_'))
        .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
    )
  },
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.jpeg': 'file',
    '.svg': 'file',
    '.gif': 'file',
    '.webp': 'file',
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
  },
  external: [],
  publicPath: '/',
});

if (!result.success) {
  console.error('❌ Build failed');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('✅ Build completed successfully!');
console.log(`📦 Output: ${result.outputs.length} files`);

// Ensure dist directory exists
mkdirSync('./dist', { recursive: true });

// Copy public directory
if (existsSync('./public')) {
  cpSync('./public', './dist', { recursive: true });
  console.log('✅ Public assets copied');
}

// Generate index.html with proper script references
const mainJsFile = result.outputs.find(output =>
  output.path.includes('main') && output.path.endsWith('.js')
);

const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/logo-padding.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="/index.css" />
    <title>Duck UI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${mainJsFile ? mainJsFile.path.split('/').pop() : 'main.js'}"></script>
  </body>
</html>`;

writeFileSync('./dist/index.html', indexHtml);
console.log('✅ index.html generated');
