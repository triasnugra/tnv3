// Susun folder site/ untuk GitHub Pages: dasbor + data.
import fs from 'node:fs';
fs.rmSync('site', { recursive: true, force: true });
fs.mkdirSync('site/data', { recursive: true });
fs.copyFileSync('web/index.html', 'site/index.html');
for (const f of fs.existsSync('data') ? fs.readdirSync('data') : []) fs.copyFileSync('data/' + f, 'site/data/' + f);
fs.writeFileSync('site/.nojekyll', '');
console.log('site/ siap:', fs.readdirSync('site/data').join(', ') || '(data kosong)');
