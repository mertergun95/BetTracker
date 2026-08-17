#!/usr/bin/env bash
# Starts BetTracker in the browser. Leave the terminal open.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js bulunamadı. https://nodejs.org adresinden kurup tekrar dene."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "=== Bağımlılıklar kuruluyor, ilk sefer birkaç dakika sürebilir ==="
  npm install || { echo "Kurulum başarısız."; exit 1; }
fi

echo
echo "=== BetTracker başlatılıyor ==="
echo "Tarayıcıda http://localhost:5173/BetTracker/ adresini aç."
echo "Bu terminali açık bırak."
echo
npm run dev
