# VlogUp bundled assets: sources and licences (checked 2026-10-31)

- **Rule:** only bundle assets under CC0, MIT, Apache-2.0, BSD or OFL-1.1, or our own originals. Every file gets an entry in `assets/LICENSES.json` (id, source URL, licence, author, date checked).
- **Rule:** no proprietary template assets (CapCut, InShot, VN, Splice, Mojo, Canva, Envato/Motion Array, Mixkit). We study *styles* only.

## Bundle list

| Asset type | Source | Licence | Verified | What we take |
|---|---|---|---|---|
| **LUTs (13)** | **VlogUp originals**: generated procedurally from parametric colour transforms (our code) | CC0 / MIT (ours) | n/a (we author them) | `vlogup-clean-bright`, `-neutral`, `-punch`, `-teal-orange`, `-soft-film`, `-warm-film`, `-food-warm`, `-glow`, `-gritty`, `-vhs`, `-neon-night`, `-earthy-green`, `-pop-bright`. Neutral names; no film-stock trademarks. |
| LUTs (optional extra) | FreshLUTs — https://freshluts.com | CC0, per LUT | ✅ "CC0, free for commercial use, no attribution" shown on the LUT pages checked (e.g. /luts/109) | Hand-pick a few; check the licence of each LUT; record it in LICENSES.json |
| LUTs (optional extra) | EditorHub "Originals" — https://editor-hub.com/assets/luts | CC0 (site statement) | ⚠️ site statement only | Optional, re-check before bundling |
| **Transitions** | gl-transitions — https://github.com/gl-transitions/gl-transitions | MIT (repo LICENSE plus a per-shader header) | ✅ `// License: MIT` checked in 18 shaders: Directional, CrossZoom, SimpleZoom, ZoomInOut, FlashFade, Fade, FadeColor, LinearBlur, DefocusBlur, TangentMotionBlur, GlitchMemories, GlitchDisplace, FilmBurn, Dreamy, Overexposure, StaticFade, TvStatic, LumaWipe | Port to our PixiJS pipeline; CircleOpen to be checked; keep each author header |
| **Overlays** (grain, light leaks, VHS scanlines/tracking, vignette, bloom) | **VlogUp originals**: procedural GLSL | MIT (ours) | n/a | No video overlay files needed |
| **SFX core pack (16 ids)** | **VlogUp originals**: procedurally synthesised (noise sweeps for whoosh/swoosh, filtered sine for pop/click/ding, risers, sub hits, tape-stop pitch ramp, static and glitch bursts) | CC0 (ours) | n/a | `whoosh-short`, `whoosh-long`, `swoosh-soft`, `pop`, `confetti-pop`, `click`, `ding`, `sparkle`, `riser`, `bass-hit`, `impact-light`, `camera-shutter`, `vhs-glitch`, `tape-static`, `tape-stop`, `tape-insert` |
| SFX extras | Kenney audio packs (Interface Sounds and others) — https://kenney.nl/assets | CC0 | ✅ the pack's License.txt says CC0 1.0 | UI clicks, pops, confirmations |
| SFX extras | Freesound — https://freesound.org (filter: CC0 only) | CC0, per sound | ⚠️ per-sound licence must be checked; packs mix licences, and remixes inherit them | e.g. whoosh and riser packs, only files marked CC0 |
| **Fonts (15)** | Google Fonts — https://github.com/google/fonts | **OFL-1.1** (bundling allowed; ship OFL.txt) | ✅ all 15 are under `ofl/` in google/fonts | Inter, Montserrat, Poppins, Space Grotesk, Bebas Neue, Anton, Oswald, Archivo Black, Playfair Display, DM Serif Display, Cormorant Garamond, Caveat, Pacifico, Fredoka, VT323 |
| Emoji | Noto Emoji (Google) | OFL-1.1 (to confirm) | ⚠️ not re-checked this session | Caption emoji; fallback is the system emoji font |
| **Text and caption animations** | **VlogUp originals**: parametric animation code (pop, bounce, karaoke, typewriter, mask-reveal, letter-spread, handwrite, slide) | MIT (ours) | n/a | No Lottie files needed for v1 |
| Lottie (authoring tool) | diffusionstudio/lottie — https://github.com/diffusionstudio/lottie | MIT (5.7k★) | ✅ repo licence MIT | Optional *tool* to generate our own Lottie stickers (output = ours) |
| **Music (library)** | FreePD (Kevin MacLeod) — https://freepd.com | CC0 1.0 | ✅ mirror states all music is CC0 1.0 | 10–20 tracks covering chill, lofi, upbeat, cinematic, retro, playful, ambient, party |
| Music (optional, with credit) | incompetech (Kevin MacLeod) — https://incompetech.com | CC BY 4.0 (attribution required) | ✅ FAQ | Only if the app auto-adds the credit line to the export description |
| Music (user) | The user's own files, e.g. Suno tracks from their subscription | User's rights per Suno terms | ⚠️ Suno terms not checked here | Imported by the user, never bundled |

## Not bundled (and why)

| Source | Reason |
|---|---|
| **Mixkit** SFX/music/templates | Its licence forbids redistributing items "on its own, as stock, in a tool or template". |
| **Sonniss GDC bundles** | Its licence forbids supplying the sounds as an "asset pack, project template, software development kit or anything similar". |
| **Pixabay** music/SFX | Its licence bans standalone distribution. The user can import Pixabay files themselves for their own videos. |
| **LottieFiles** free animations | The Lottie Simple License is not OSI-approved (SPDX declined it in Feb 2026); it is share-alike and has a "no competing service" clause. A user import may come in v2; we don't bundle them. |
| **YouTube Audio Library** | Licensed for use on YouTube only; not redistributable. Users may pick tracks themselves for YouTube uploads. |
| **CapCut / InShot / VN / Splice / Mojo / Canva / Envato / Motion Array** templates and assets | Proprietary. We study styles only. |
| **RawTherapee film-simulation HaldCLUTs** | Licensed CC BY-SA 4.0 as far as I know (not re-checked this session; share-alike), which clashes with an MIT asset bundle. Also they use film-stock trademark names. |
| essentia.js / aubio | AGPL / GPL code (see SPEC v0.2). |
