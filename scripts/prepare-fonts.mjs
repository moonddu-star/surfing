import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/fonts');
const sources = [
  ['@fontsource/barlow-condensed', 'latin-600.css', 'barlow-condensed'],
  ['@fontsource-variable/dm-sans', 'index.css', 'dm-sans'],
  ['@fontsource-variable/noto-sans-kr', 'index.css', 'noto-sans-kr']
];
const styles = [];
for (const [name, stylesheet, folder] of sources) {
  const packageRoot = resolve(root, 'node_modules', name);
  let css = await readFile(resolve(packageRoot, stylesheet), 'utf8');
  for (const match of css.matchAll(/url\((\.\/files\/[^)]+)\)/g)) {
    const target = resolve(output, folder, match[1]);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(packageRoot, match[1]), target);
  }
  await copyFile(resolve(packageRoot, 'LICENSE'), resolve(output, folder, 'license.txt'));
  css = css.replaceAll('url(./files/', `url(./${folder}/files/`).replaceAll('DM Sans Variable', 'DM Sans').replaceAll('Noto Sans KR Variable', 'Noto Sans KR');
  styles.push(css);
}
await writeFile(resolve(output, 'fonts.css'), styles.join('\n'));
console.log('Local fonts and licenses prepared.');
