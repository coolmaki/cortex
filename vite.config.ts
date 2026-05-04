import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'webviews'),
  build: {
    outDir: path.resolve(__dirname, 'out/webviews'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        reader: path.resolve(__dirname, 'webviews/reader/index.html'),
      },
      output: {
        // Stable names — extension host references these paths directly
        entryFileNames: '[name]/[name].js',
        chunkFileNames: '[name]/chunks/[name].js',
        assetFileNames: '[name]/[name].[ext]',
      },
    },
  },
});
