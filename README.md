# VlogUp — become a vlogger

**An open-source, phone-first vlog editor with an AI editor.** Add your clips, say how you want your vlog,
and the AI edits it on a real, editable timeline. Then fix anything by chatting, and export.

- **Live app:** https://danmo88.github.io/vlogup/ (installable: tap **Install app**, on Android, iPhone, Windows and Mac)
- **Status:** Milestone **M1, the core editor**, is live. The AI editor arrives in M4 (see the [roadmap](#roadmap)).
- **Licence:** MIT · **Privacy:** your footage never leaves your device · **Cost:** free, no servers, no ads. For the AI you bring your own key.

## Vision

Every serious "chat with your video editor" tool today is desktop or cloud: Descript, Eddie, Mosaic, OpenChatCut, Cutboard
and WeftCut. VlogUp is the one that lives on your **phone**, as an installable web app. It is open source, uses your
**own Grok, Claude or ChatGPT key**, and is made for **vlogs only**.

The AI doesn't stop at simple cuts. It does a *pro* edit:
- pacing to your speech energy and music beats;
- J/L cuts;
- shader transitions;
- auto colour, shot matching and LUT looks;
- punch-ins and smart 9:16 reframing;
- voice denoise, EQ and compression, −14 LUFS loudness and music ducking;
- animated captions with keyword highlights;
- b-roll from your own clips;
- a story-aware hook / setup / payoff / CTA structure;
- an auto-QC pass before it says **Done**.

The language model decides *what and why*. Deterministic code decides *exactly where*: it snaps every cut to word
boundaries, zero-crossings and the beat grid. That avoids the "cut mid-word" problems of other AI editors.
Full design: [`docs/SPEC.md`](docs/SPEC.md).

## What works today (M1)

- **Installable PWA** that works offline after the first load. The Install button covers Android, iOS and desktop.
- **InShot-style mobile layout:**
  - preview at the top;
  - a scrolling tool row;
  - a timeline with a fixed centre playhead (pinch or ±zoom);
  - the AI chat bottom sheet (3 heights).
- **Import** videos and photos in order with **＋**. The first clip sets the canvas orientation.
- **Proxy preview:** each clip is transcoded in the background to a 540p proxy with Mediabunny, for smooth playback on
  phones. Export always uses the originals.
- **Timeline editing:**
  - reorder (drag or ↑/↓);
  - trim (drag the handles or use the sliders);
  - split at the playhead;
  - delete;
  - volume 0–200% and mute;
  - photo duration.
- **Canvas:** 16:9 (YouTube), 9:16 (Shorts/Reels/TikTok) or 1:1. Mismatched clips get an InShot-style blurred fill.
- **Text overlays:** 3 styles, colours, size, top/middle/bottom or drag on the preview, start and end times.
- **Export:** MP4 at 720p or 1080p, 30 fps, through **WebCodecs via Mediabunny**.
  - H.264, with VP9/AV1 as fallbacks;
  - AAC, or Opus where AAC is unavailable;
  - 8 ms anti-click fades on every cut;
  - Share or Save, plus Download.
- **Projects** are saved on the device: media in **OPFS** (IndexedDB fallback), projects in **IndexedDB**.
- **Versioned timeline JSON** (`vlogup/timeline` v1) with an **append-only edit log**. Every edit, and even every undo
  or redo, is an op, so undo/redo is exact and the AI (M4) gets precise diffs. You can download the project JSON.
- **AI settings (BYO key):** pick Grok, Claude or ChatGPT and store your key **only in this browser's localStorage**.
  The chat itself says "coming in M4".
- **Templates tab** (placeholder): lists the 16 bundled edit-recipe templates from [`templates/`](templates/), such as Fast Daily, Cinematic Travel, Beat-Sync Montage and Retro VHS. Each shows its name and description, labelled **AI apply coming in M4**. Schema: [`templates/SCHEMA.md`](templates/SCHEMA.md); asset sources and licences: [`templates/ASSETS.md`](templates/ASSETS.md).

## Roadmap

| Milestone | What | Status |
|---|---|---|
| **M1 · Core editor on phones** | PWA shell; import, order and reorder; timeline; trim, split, delete, volume; text; proxy preview; 720p/1080p export via Mediabunny; OPFS/IndexedDB projects; versioned JSON plus op log | ✅ **live** |
| **M2 · Analysis + pro audio + captions** | On-device Whisper word timestamps; silences, fillers and bad takes; energy, beats and faces; denoise (DeepFilterNet/RNNoise), EQ/compression, −14 LUFS, ducking, a CC0 SFX pack; animated captions with keyword highlight; free DSP chips | next |
| **M3 · Pro visuals** | 6 shader transitions (PixiJS/WebGL2); auto colour plus shot match plus LUTs; Ken Burns; punch-ins; smart 9:16 reframe; speed ramps; titles, lower thirds, intro/outro; b-roll track with J/L cuts | planned |
| **M4 · AI editor** | Grok / Claude / ChatGPT with your key; typed tool-calling; deterministic snapper; plan → **Done** → change list → Before/After; partial fixes; 4 style presets; **templates**; story builder; auto-QC; cost meter | planned |
| **M5 · Polish & v1.0** | Onboarding; performance auto-downgrade; before/after demos; optional CORS-proxy template; public v1.0 release | planned |

## Known limitations (M1)

- **iPhone/iPad:**
  - Export needs **iOS/iPadOS 26+**, because WebCodecs video encoding is required. Older iOS can edit, but cannot export.
  - iOS may evict website storage after a few weeks without use. Install the app to the Home Screen to keep projects.
  - Long 4K clips can hit Safari's memory limits.
- **Firefox on Android** has no WebCodecs, so export doesn't work there. There's no ffmpeg.wasm fallback yet, since it isn't needed on Chrome, Edge, Samsung Internet or Safari 26.
- The whole export is held in memory before you save it. For long 1080p vlogs (more than about 10 minutes) on
  low-memory phones, export at 720p. Streaming to OPFS is planned.
- The preview uses Canvas2D. WebGL effects come in M3.
- Single main video track only. The b-roll overlay, music, voice and SFX tracks are reserved in the schema for M2/M3.
- Keep the app in the foreground while exporting (it requests a screen wake lock).

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173/vlogup/
npm run build          # type-check + production build into dist/
npm run test:unit      # timeline / op-log tests (Vitest)
npx playwright test    # e2e: import → trim/split/reorder/text → reload → 1080p export (needs Chrome + ffprobe)
npm run license-check  # fails on anything but MIT / Apache / BSD / ISC / MPL
```

Every push to `main` runs the following through GitHub Actions:
- the licence check;
- the type-check;
- the unit tests and the build;
- deployment to GitHub Pages;
- the Chrome e2e smoke test.

### Code map

```
src/model/     timeline schema, pure op reducer, append-only log, undo/redo
src/media/     import/probe, 540p proxies, OPFS + IndexedDB storage, capability detection
src/engine/    shared Canvas2D compositor, preview player, Mediabunny MP4 exporter
src/ai/        BYO-key provider settings (M4 adapters will live here)
src/templates/ template loader (Templates tab)
templates/     template JSON recipes + JSON Schema + asset licence notes
src/ui/        Preact UI (home, editor, timeline, panels, chat sheet, export)
```

## Credits and reuse

VlogUp builds on great open-source work. **No AGPL/GPL code is copied**: those projects are credited for ideas only.

| Project | Licence | What we use |
|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 | The media engine: demux, decode, encode and mux through WebCodecs (unmodified npm dependency) |
| [Preact](https://github.com/preactjs/preact) | MIT | UI |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | Apache-2.0 | IndexedDB storage |
| [Timeline Studio](https://github.com/MartinDelophy/ai-video-editor) | MIT | Reference for the Mediabunny export pipeline and the timeline data model |
| [Cutboard / OpenCardboard](https://github.com/rakesh0x/OpenCardboard) | MIT | The typed tool API and the **append-only op log** pattern |
| [auto-editor](https://github.com/WyattBlue/auto-editor) | Unlicense | Silence-cut algorithm (M2) |
| [editly](https://github.com/mifi/editly), [gl-transitions](https://github.com/gl-transitions/gl-transitions), [Omniclip](https://github.com/omni-media/omniclip) | MIT | JSON spec shape; transition and filter shaders (M3) |
| [OpenReelio](https://github.com/openreelio/openreelio) | MIT | The auto-QC pass idea (M4) |
| [FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) | Apache-2.0 | "Save my edit as a style" idea |
| [LAVE](https://arxiv.org/abs/2402.10294) (paper) | n/a | Visual narration per scene, so the LLM can "see" the footage |
| [OpenChatCut](https://github.com/0xsline/OpenChatCut), [X-Cut](https://github.com/MeiGen-AI/X-Cut), OpenShot | AGPL/GPL | **Ideas only, no code** |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | MIT | UX inspiration |
| Gitgather | MIT | Install-button flow |

## Privacy and security

- No VlogUp servers. Clips, proxies and projects stay in your browser's storage.
- AI keys stay in your browser's `localStorage`. From M4 they are sent only to the provider you picked, or to your own
  optional proxy. A strict Content-Security-Policy allows network calls only to `api.x.ai`, `api.anthropic.com` and
  `api.openai.com`, and blocks third-party scripts.
- This repository contains no secrets.

## Contributing

Issues and PRs are welcome. The test is simple: every feature must save a vlogger time. Please keep dependencies to
MIT, Apache, BSD, ISC or MPL licences (CI enforces this).
