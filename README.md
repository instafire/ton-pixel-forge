# TON Pixel Forge

Mint animated NFTs on [TON](https://ton.org/) for gas-only cost — in the style of Telegram Gifts (Clover Pin, Snoop Cigar, Instant Ramen). No platform fee, no minting service: users pay ~0.1 TON once to deploy their own TEP-62 collection contract, then ~0.055 TON per NFT (mostly refunded by the chain as unused storage reserve).

**Live demo:** https://ton-pixel-forge.amnhira.workers.dev *(testnet)*

## Features

- **Forge** — generative gift-style art engine (canvas 2D, 512×512): 10 glossy items × 8 model colorways × 8 backdrops × 8 symbol patterns × 4 animations × 4 effects, with seeded RNG, trait locking and rarity tiers (Common → Legendary)
- **Collection Studio** — generate a full set (up to 250) with rarity stats, then mint individually or in one batch transaction (op 2 + Dictionary, up to 250 NFTs per tx)
- **AI Studio** — bring your own image-generation API (OpenAI `gpt-image-1` or any custom REST endpoint). API keys stay in the browser (localStorage) and are sent only to the endpoint you configure. Generated artwork is animated into a mint-ready 16-frame GIF (float / pulse / shimmer / orbit / slow zoom) and used automatically when minting
- **Real contracts** — getgems-standard TEP-62/64 bytecode, byte-verified against tonweb. Minted NFTs appear on getgems.io and tonviewer automatically
- **Cheap metadata hosting** — a Cloudflare Worker + KV serves the app, the TON Connect manifest, collection/item metadata JSON and the animated GIFs (free tier, no API keys)

## Minting costs

| Action | Cost |
|---|---|
| Deploy collection (one-time) | ~0.1 TON |
| Mint one NFT | ~0.055 TON all-in (0.05 mint amount + gas; chain refunds most) |
| Batch mint (up to 250) | 0.05 TON × n + ~0.1 TON gas |
| Platform fee | **0** |

## Repo layout

```
├── index.html        # app shell (Forge / Collection / AI Studio / Guide tab)
├── styles.css        # retro-terminal dark theme
├── app.js            # UI logic, TEP-62 cell builders, TON Connect mint flow, AI Studio
├── art.js            # generative art engine + GIF encoder (browser + Node dual export)
├── worker/worker.js  # Cloudflare Worker: app hosting + metadata/GIF storage (KV)
├── wrangler.toml     # Cloudflare deploy config
└── LICENSE           # MIT
```

## Deploy your own

### 1. Cloudflare Worker (app + metadata host)

```bash
npm install -g wrangler
wrangler login
wrangler kv namespace create FORGE_KV
# put the returned namespace id into wrangler.toml
wrangler deploy
```

The worker serves the app files, `/tonconnect-manifest.json`, `/meta/<collId>/...` metadata and `/meta/<collId>/<n>.gif` images, and accepts `POST /mint` uploads from the app.

### 2. App configuration

`app.js` reads its base URL from the `__WORKER_BASE__` placeholder, which the worker replaces with the request origin at serve time — so the same files work on any deployment with no edits. If you host the static files elsewhere (GitHub Pages etc.), replace `__WORKER_BASE__` with your worker URL.

### 3. Network

The app targets **TON testnet** by default (`NETWORK = 'testnet'` in `app.js`). To go mainnet:

1. Set `NETWORK = 'mainnet'` in `app.js`
2. Get real TON in your wallet (Tonkeeper, Telegram Wallet, MyTonWallet — any TON Connect 2 wallet works)

Free testnet TON: [@testgiver_ton_bot](https://t.me/testgiver_ton_bot)

## Tech notes

- Cell building uses `@ton/core` (loaded from jsDelivr ESM) with a `buffer` polyfill; contract bytecode is the getgems standard collection/item pair, verified byte-for-byte against tonweb's reference builders
- GIF encoding happens in-browser via [gifenc](https://github.com/mattdesl/gifenc) — 16 frames at 512×512, ~600 KB per NFT
- The TON Connect manifest is served by the worker at `/tonconnect-manifest.json`; wallets use it to display the app name/icon
- Trait weights drive rarity: each trait has a weight `w` (1 = common … 5 = ultra-rare); the sum maps to Common / Rare / Epic / Legendary tiers

## License

MIT