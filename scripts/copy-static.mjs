import { copyFileSync, cpSync, mkdirSync } from 'node:fs';

// Копируем файлы, которые загружаются обычными скриптами и динамическими адресами.
for (const directory of ['assets', 'vendor', 'prototype', 'data']) {
  cpSync(directory, `dist/${directory}`, { recursive: true });
}
mkdirSync('dist', { recursive: true });
copyFileSync('app.js', 'dist/app.js');
