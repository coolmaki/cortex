import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.env.NODE_ENV === 'production';

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('Watching for extension host changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
