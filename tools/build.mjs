import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const scripts = [
  'vendor/three.min.js',
  'src/tex.js',
  'src/post.js',
  'src/world.js',
  'src/props.js',
  'src/actors.js',
  'src/audio.js',
  'src/app.js'
];

let html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const code = scripts.map(rel => {
  const js = fs.readFileSync(path.join(site, rel), 'utf8');
  if (js.includes('</script>')) throw new Error('Unsafe </script> in ' + rel);
  return '\n/* ---- ' + rel + ' ---- */\n' + js;
}).join('\n');
html = html.replace(/<script src="[^"]+"><\/script>\s*/g, '');
html = html.replace('</body>', () => '<script>' + code + '</script>\n</body>');
fs.writeFileSync(path.join(site, 'standalone.html'), html);
console.log('Built site/standalone.html — ' + (fs.statSync(path.join(site, 'standalone.html')).size / 1024 / 1024).toFixed(2) + ' MB');
