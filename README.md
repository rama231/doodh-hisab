# Doodh Hisab 🥛

Daily milk record portal — roz ka doodh, rate aur auto hisab.

**Live:** https://doodh-hisab-nine.vercel.app

## Features

- Daily entry: date + shift (subah / shaam) + liter + rate → amount auto calculate
- Default rate per shift (auto-fill), fat & note optional
- Duplicate entry guard (same date + shift replace prompt)
- Month / shift filter, edit & delete, custom confirm dialogs
- Summary: month liters, amount, avg rate, today's total, 14-day bar chart
- Excel (.xlsx) export with Records + Monthly Summary sheets, CSV export/import, JSON backup & restore, print / PDF
- Mobile-first, dark mode, offline PWA (installable via "Add to Home screen")
- Hindi/Hinglish UI, ₹ (INR) formatting

## Data storage

Sara data browser ke `localStorage` me rehta hai (`doodh_hisab_v1`) — koi server, koi account nahi.
Isliye data per-browser hota hai: regular **Backup (JSON)** lein aur doosre device par **Restore** karein.

## Tech

Plain HTML / CSS / JS (no build step), service worker for offline, deployed on Vercel.

```
index.html   – markup
styles.css   – styling (light + dark)
app.js       – state, rendering, import/export
csv-import.js – CSV parser + flexible column mapping (import)
xlsx-lite.js – dependency-free .xlsx writer (ZIP + inline strings)
sw.js        – offline cache
vercel.json  – clean URLs + headers
```

## Local run

```bash
python -m http.server 8123
# open http://127.0.0.1:8123
```

## Deploy

```bash
npx vercel deploy --prod
```

## Auto deploy

Har git push (main branch) par Vercel khud deploy karta hai - GitHub integration connected hai.
