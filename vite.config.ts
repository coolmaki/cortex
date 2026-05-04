import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    root: path.resolve(__dirname, "src/webviews"),
    build: {
        outDir: path.resolve(__dirname, "out/webviews"),
        emptyOutDir: false,
        rollupOptions: {
            input: {
                reader: path.resolve(__dirname, "src/webviews/reader/index.html"),
            },
            output: {
                entryFileNames: "[name]/[name].js",
                chunkFileNames: "[name]/chunks/[name].js",
                assetFileNames: "[name]/[name].[ext]",
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
});
