import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const output = new URL('../public/vendor/three/', import.meta.url);
await mkdir(output, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('../node_modules/three/build/three.module.js', import.meta.url))], bundle: true, minify: true, format: 'esm', target: 'es2022', outfile: fileURLToPath(new URL('three.module.min.js', output)), legalComments: 'eof' });
await copyFile(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('LICENSE.txt', output));
console.log('Local Three.js runtime and license prepared.');
