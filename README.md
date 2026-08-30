# Accordeur

Accordeur chromatique pour guitare et ukulélé, en Progressive Web App (installable, fonctionne hors-ligne, aucune donnée envoyée sur un serveur).

**App en ligne : https://flosml.github.io/accordeur/**

## Fonctionnalités

- Détection de hauteur en temps réel via le micro (autocorrélation sur le signal audio, dans le navigateur)
- Guitare (accordage standard Mi La Ré Sol Si Mi) et Ukulélé (accordage standard Sol Do Mi La)
- Jauge d'écart en cents avec code couleur (vert = juste, jaune = proche, bleu/rouge = trop grave/aigu)
- Installable sur mobile et desktop (manifest + service worker)

## Développement

```bash
npm install
npm run dev
```

## Build de production

```bash
npm run build
npm run preview
```

Les fichiers de production sont générés dans `dist/`, prêts à être déployés sur n'importe quel hébergeur statique (Netlify, Vercel, GitHub Pages, etc.). Le service worker et le manifest PWA sont générés automatiquement par `vite-plugin-pwa`.

## Icônes

Les icônes de l'app (`public/icons/`) sont générées par `scripts/generate-icons.mjs` (aucune dépendance externe) :

```bash
node scripts/generate-icons.mjs
```

## Auteur

Florian Soumaille

## Licence

[MIT](LICENSE)
