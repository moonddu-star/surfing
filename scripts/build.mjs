import './prepare-fonts.mjs';

import { mkdir, copyFile, cp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
if (output !== resolve(root, 'dist')) throw Error('Invalid build directory');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(resolve(root, 'index.html'), resolve(output, 'index.html'));
for (const directory of ['src', 'public']) await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
console.log(`Built static POC in ${output} (${(await readdir(resolve(output, 'src'))).length} source assets).`);
