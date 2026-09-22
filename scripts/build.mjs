import { mkdir, copyFile, cp, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await mkdir(output, { recursive: true });
await copyFile(resolve(root, 'index.html'), resolve(output, 'index.html'));
for (const directory of ['src', 'public']) await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
console.log(`Built static POC in ${output} (${(await readdir(resolve(output, 'src'))).length} source assets).`);
