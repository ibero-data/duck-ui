// file: preview-server.ts
// description: Bun preview server for production builds
// reference: https://bun.sh/docs/api/http

console.log('🦆 Starting Duck-UI preview server with Bun...');

const server = Bun.serve({
  port: 4173,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname;

    // Serve index.html for root and SPA routes
    if (filePath === '/' || !filePath.includes('.')) {
      filePath = '/index.html';
    }

    const distPath = `./dist${filePath}`;

    try {
      const file = Bun.file(distPath);
      if (await file.exists()) {
        return new Response(file);
      }

      // Fallback to index.html for SPA routing
      const indexFile = Bun.file('./dist/index.html');
      if (await indexFile.exists()) {
        return new Response(indexFile, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error serving file:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
  error(error) {
    console.error('Server error:', error);
    return new Response('Internal Server Error', { status: 500 });
  },
});

console.log(`✅ Preview server running at http://localhost:${server.port}`);
console.log('📦 Serving from ./dist directory');
