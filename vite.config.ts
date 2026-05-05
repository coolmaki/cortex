import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    root: path.resolve(__dirname, "src/webviews"),
    // Use relative URLs for everything so chunks/CSS preloads resolve correctly
    // when loaded inside a VS Code webview (whose origin isn't our extension dir).
    base: "./",
    build: {
        outDir: path.resolve(__dirname, "out/webviews"),
        emptyOutDir: false,
        rollupOptions: {
            input: {
                reader: path.resolve(__dirname, "src/webviews/reader/index.html"),
            },
            output: {
                // Entry lives at the bundle root so dynamic-import chunk paths
                // (relative to the bundle root) also resolve correctly from the
                // script's own URL inside the webview.
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "[name][extname]",
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    optimizeDeps: {
        exclude: ["mermaid"],
    },
});
