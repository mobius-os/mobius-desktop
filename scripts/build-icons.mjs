import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import png2icons from 'png2icons';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'assets', 'icons', 'icon.png'));
const icns = png2icons.createICNS(source, png2icons.BICUBIC2, 0);
const ico = png2icons.createICO(source, png2icons.BICUBIC2, 0, false, true);

if (!icns || !ico) throw new Error('Could not create desktop icon files.');
await Promise.all([
  writeFile(path.join(root, 'assets', 'icons', 'icon.icns'), icns),
  writeFile(path.join(root, 'assets', 'icons', 'icon.ico'), ico),
]);
console.log('Created assets/icons/icon.icns and assets/icons/icon.ico');
