import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'static',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096, // Inline small assets (<4KB) as base64 to reduce HTTP requests
    target: 'es2020',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: 'index.html',
        assetChecker: 'asset-checker.html',
      },
      output: {
        manualChunks: {
          three: ['three'],
        },
        // Use relative paths for offline-capable builds
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
});
