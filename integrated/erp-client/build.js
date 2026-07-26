// build.js — bundles client/src/main.jsx -> client/dist/app.js using esbuild.
// Run `npm install` in this directory first (pulls in esbuild, react,
// react-dom from devDependencies/dependencies), then `npm run build`.
// Vite is also a fine alternative if you'd rather use that instead - this
// project just uses esbuild directly to keep the toolchain minimal.

const path = require('path');
const fs = require('fs');

function resolveEsbuild() {
  try {
    return require('esbuild');
  } catch (e) {
    throw new Error('Could not locate esbuild. Run `npm install` in erp-client/ first.');
  }
}

const esbuild = resolveEsbuild();

const outDir = path.join(__dirname, 'dist');
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Copy static assets (index.html, etc.) from public/ into dist/
if (fs.existsSync(publicDir)) {
  for (const file of fs.readdirSync(publicDir)) {
    fs.copyFileSync(path.join(publicDir, file), path.join(outDir, file));
  }
}
// Note: styles.css is bundled into dist/app.css automatically by esbuild,
// since main.jsx does `import './styles.css'`.

esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'main.jsx')],
  bundle: true,
  outfile: path.join(outDir, 'app.js'),
  format: 'iife',
  loader: { '.js': 'jsx', '.jsx': 'jsx' },
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: false,
  sourcemap: false,
  logLevel: 'info',
}).then(() => {
  console.log('Build complete: dist/app.js');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
