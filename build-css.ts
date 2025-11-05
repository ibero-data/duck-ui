// file: build-css.ts
// description: CSS build script using Tailwind CSS and PostCSS
// reference: https://tailwindcss.com

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

console.log('🎨 Building CSS with Tailwind...');

async function buildCSS() {
  // Ensure dist directory exists
  if (!existsSync('./dist')) {
    mkdirSync('./dist', { recursive: true });
  }

  // Read input CSS
  const css = readFileSync('./src/index.css', 'utf-8');

  // Process with PostCSS
  const result = await postcss([
    tailwindcss,
    autoprefixer,
  ]).process(css, {
    from: './src/index.css',
    to: './dist/index.css',
  });

  // Write output
  writeFileSync('./dist/index.css', result.css);

  if (result.map) {
    writeFileSync('./dist/index.css.map', result.map.toString());
  }

  console.log('✅ CSS built successfully!');
}

buildCSS().catch((error) => {
  console.error('❌ CSS build failed:', error);
  process.exit(1);
});
