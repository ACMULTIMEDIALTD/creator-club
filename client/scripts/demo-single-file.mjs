// Inline the demo build into one HTML file (for hosts that take a single page).
// Usage: node scripts/demo-single-file.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';

const dir = 'dist-demo';
const assets = fs.readdirSync(path.join(dir, 'assets'));
const read = (ext) => fs.readFileSync(path.join(dir, 'assets', assets.find((f) => f.endsWith(ext))), 'utf8');
const js = read('.js').replace(/<\/script/gi, '<\\/script');
const css = read('.css').replace(/<\/style/gi, '<\\/style');

const html = `<title>The Creator Club</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&family=Heebo:wght@400;500;700&display=swap">
<style>:root{color-scheme:light}html{direction:rtl}${css}</style>
<div id="root" dir="rtl" lang="he"></div>
<script type="module">${js}</script>
`;
fs.writeFileSync(process.argv[2], html);
console.log(`${process.argv[2]}: ${(html.length / 1024).toFixed(0)} KB`);
