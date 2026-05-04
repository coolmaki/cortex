import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const production = process.env.NODE_ENV === "production";

const aliasPlugin = {
    name: "path-alias",
    setup(build) {
        build.onResolve({ filter: /^@\// }, async (args) => {
            const aliasedPath = path.resolve(__dirname, "src", args.path.slice(2));
            return build.resolve(aliasedPath, { kind: args.kind, resolveDir: args.resolveDir });
        });
    },
};

const ctx = await esbuild.context({
    entryPoints: ["src/extension/index.ts"],
    bundle: true,
    outfile: "out/extension.js",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: !production,
    minify: production,
    logLevel: "info",
    plugins: [aliasPlugin],
});

if (watch) {
    await ctx.watch();
    console.log("Watching for extension host changes…");
} else {
    await ctx.rebuild();
    await ctx.dispose();
}
