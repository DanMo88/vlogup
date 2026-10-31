# VlogUp — Design Spec v0.2 (design only, no code yet)

- Panel: PM · Mobile UI/UX · Video engineer · AI engineer · Vlogger (end user)
- Research date: 2026-10-31
- Changes since v0.1:
  - pro editing engine;
  - prior-art review;
  - recommended base;
  - revised MVP, architecture and milestones.

## A) Debate summary (v0.1 + v0.2 round)

1. **Scope (PM vs vlogger).**
   - Resolved: the AI does about 90% of the edit; manual trim, split and reorder always stay available.
   - The LAVE paper backs this: users want both an agent and direct manipulation.
2. **Differentiation.**
   - Every serious rival is desktop or cloud: Descript, Eddie, Mosaic, OpenChatCut, Cutboard, WeftCut.
   - Resolved: VlogUp is phone-first, an installable web app, BYO AI key, open source (MIT), vlogs only.
3. **Layout.**
   - Resolved: the chat is a 3-height bottom sheet.
   - The preview and timeline shrink while the chat is expanded.
4. **Engine.**
   - Resolved: WebCodecs via Mediabunny is the main engine.
   - ffmpeg.wasm is only a lazy fallback, because of its 2 GB limit and crashes on iOS Safari.
5. **4K on phones.**
   - Resolved: proxy editing at 540p/720p.
   - Export renders from the originals in chunks.
6. **"Pro edit" vs phone performance (new, the hottest debate).**
   - Video engineer: real-time denoise, face tracking, grading and transitions all at once will melt a phone.
   - Resolved with three tiers:
     - **Analyse once** (in the background, in workers, results cached).
     - **Live preview** (proxy plus cheap WebGL shaders only).
     - **Bake at export** (full-quality audio chain and effects).
7. **AI judgment vs determinism (new).**
   - The AI engineer cited Descript Underlord complaints: words cut mid-syllable, audio desync, credits burned.
   - Resolved:
     - the LLM decides *what and why*;
     - deterministic DSP code decides *exactly where*: snap to word boundaries, zero-crossings, beat grid;
     - add 1–2 frame handles plus audio crossfades on every cut.
8. **Style presets vs a creator's identity (new).**
   - The vlogger warned: "I don't want to look like a MrBeast clone."
   - Resolved:
     - presets are parameter bundles (pace, zoom frequency, caption style, SFX density, grade);
     - they use neutral names ("Fast Daily", "Cinematic Travel", "High-Retention", "Calm Aesthetic");
     - the AI can blend them with the user's own learned style.
9. **Fork vs build (new).**
   - PM: "OpenCut has 97k★, just fork it." Video engineer: OpenCut is mid-rewrite to a Rust core and closed to contributions; classic is Next.js and frozen.
   - Omniclip is MIT but desktop-UI, Lit plus older ffmpeg/mp4box.
   - Timeline Studio is the closest stack (MIT, Vite+React+Mediabunny), but it is huge, desktop-first and full of non-vlog features.
   - Resolved: **build a new mobile-first app**, lifting MIT code and patterns from Timeline Studio, Omniclip and Cutboard.
10. **Licences (new).**
    - essentia.js (AGPL) and aubio (GPL) are out as code; their ideas only.
    - Beats come from Apache/MIT libs or our own onset detector.
    - Remotion is not used: source-available, paid for editor products.
11. **Keys and CORS.**
    - Calls go direct from the browser with the user's own key.
    - The Anthropic header is required.
    - An optional self-hosted proxy covers xAI, which flip-flopped on browser access during 2026.
12. **Cost (new).**
    - Users hate credit burn (Descript reviews).
    - Resolved:
      - the analysis is done locally and only once;
      - each chat round sends compact summaries;
      - there is a visible cost meter;
      - quick chips run with zero LLM calls where possible (e.g. "Remove silences" is pure DSP).

## B) Final decisions

### What VlogUp is
- An open-source, phone-first vlog editor: you say how you want the vlog, and an AI editor produces a pro-level edit on a real, editable timeline.

### Core user flow
1. Open the installable app → **+ New Vlog**.
2. Tap **+** → pick clips in order → drag to reorder.
3. **Analyse** runs in the background (progress bar): proxies, transcript, silences, scenes, faces, audio energy, beats, loudness, colour stats.
4. Pick a **style preset** (optional) and type a prompt, or tap chips.
5. The AI shows a one-line plan → applies tool calls → **Done**.
6. The result auto-plays, with a **change list** and **hold to compare Before/After**.
7. Give feedback in chat → only the affected segments change → repeat.
8. Undo, or restore any version.
9. **Export**: 16:9, 9:16 or both → share or save.

### Prior art & what we reuse
(★ stars and last push as of 2026-10-31; OSS = open source)

#### Open-source chat/agent video editors

| Project | Licence · ★ · pushed | Approach | Reuse |
|---|---|---|---|
| **Timeline Studio** — [MartinDelophy/ai-video-editor](https://github.com/MartinDelophy/ai-video-editor) | MIT · 926★ · 2026-10-30 | Browser editor (Vite+React+Mediabunny+ffmpeg.wasm+transformers.js) with an AI agent, captions, WebGPU AI music, TTS and avatars | **Code reference #1**: Mediabunny export pipeline, transformers.js wiring, timeline data model. Lesson: its AI planning from metadata alone limits quality. Skip the avatar/deepfake scope. |
| **OpenChatCut** — [0xsline/OpenChatCut](https://github.com/0xsline/OpenChatCut) | AGPL-3.0 · 2.8k★ · 2026-10-21 | Electron+React+Remotion; built-in agent plus MCP; WebGL effects, LUTs, ducking, face-safe captions, person segmentation | **Ideas only** (AGPL). Its feature list is the best "pro" benchmark: face-safe caption zones, shared tools between the internal agent and MCP. |
| **Cutboard / OpenCardboard** — [rakesh0x/OpenCardboard](https://github.com/rakesh0x/OpenCardboard) | MIT · 103★ · 2026-10 (new) | Electron + ffmpeg; 30+ typed tools; append-only op log; beat grid; reference-style copy; OTIO export | **Tool API design and op-log pattern** (MIT). Its "agent edits real footage, never generates" philosophy matches ours. |
| **WeftCut** — [WeftCut/WeftCut](https://github.com/WeftCut/WeftCut) | MIT · 294★ · 2026-10-31 | Desktop NLE driven via MCP; edits land live on the timeline | UX: watch the agent's edits appear live. Desktop only. |
| **OpenReelio** — [openreelio/openreelio](https://github.com/openreelio/openreelio) | MIT · 90★ · pre-alpha | Tauri, prompt-first, event sourcing, QC checks | Ideas: an **auto-QC pass** (black frames, audio peaks, caption overlap) before Done. |
| **FireRed-OpenStoryline** — [FireRedTeam/FireRed-OpenStoryline](https://github.com/FireRedTeam/FireRed-OpenStoryline) | Apache-2.0 · 3.6k★ · 2026-10-31 | Python server; chat editing, ASR rough cut (filler/repeat removal), beat-synced BGM, "save edit as Skill" | Ideas, plus prompt designs under Apache. **"Save my edit as a style"** maps to our learned style. |
| **X-Cut** — [MeiGen-AI/X-Cut](https://github.com/MeiGen-AI/X-Cut) | AGPL · 34★ | Agno agent + Remotion, chat-driven vlog | Ideas only. |
| **diffusionstudio/agent** + **core** — [agent](https://github.com/diffusionstudio/agent), [core](https://github.com/diffusionstudio/core) | MIT / MPL-2.0 · ~300★ / 1.25k★ · core pushed 2025-11 | LLM writes code against a WebCodecs compositor | Lesson: "LLM writes code" is powerful but brittle. We choose typed tools. Core is a possible compositor reference. |
| **video-db/Director** — [video-db/Director](https://github.com/video-db/Director) | MIT · 1.6k★ · 2026-01 | Cloud agent framework over the VideoDB API | Lesson: cloud lock-in. Skip. |
| **Claude-Code editors**: [riecodes/free247editor](https://github.com/riecodes/free247editor), [ghost-editor](https://github.com/kurbaitaev/ghost-editor), [ai-video-editor-cooked](https://github.com/nextwork-projects/ai-video-editor-cooked), [video-alchemy](https://github.com/kingbootoshi/video-alchemy), [auto-vlog-editor](https://github.com/tstambulsky/auto-vlog-editor) | MIT · 10–160★ · 2026 | Skill files plus ffmpeg, run by a coding agent | **Prompt recipes** (talking-head rules, "edit in the style of creator X"). Lesson: the demand is real, but these need a terminal; we give it to normal users. |

#### Classic editors and engines

| Project | Licence · ★ · pushed | Approach | Reuse |
|---|---|---|---|
| **OpenCut** — [OpenCut-app/OpenCut](https://github.com/OpenCut-app/OpenCut), [opencut-classic](https://github.com/opencut-app/opencut-classic) | MIT · 97k★ | Being rewritten in Rust (Editor API, MCP, mobile planned); not taking contributions. Classic is Next.js+Mediabunny, frozen. | Do not fork. Watch its future Editor API/MCP. Lift classic UI patterns if useful. Open issues show export bugs ("stuck at 5%", sound export). |
| **Omniclip** — [omni-media/omniclip](https://github.com/omni-media/omniclip) | MIT · 1.5k★ · last release 1.1.3 Aug 2025 | Browser NLE: Lit + PixiJS 7 + ffmpeg.wasm + mp4box/web-demuxer; transitions and filters | **Transition and filter shader code** (via PixiJS) as a reference. Desktop UI, aging stack. Watch [omnitool](https://github.com/omni-media/omnitool) (MIT, programmatic timelines). |
| **auto-editor** — [WyattBlue/auto-editor](https://github.com/WyattBlue/auto-editor) | Unlicense · 5.7k★ · 2026-10-31 | CLI: cuts by audio loudness or motion, with margins | **Algorithm** for silence cuts (threshold, margin, min-clip). Public domain, so it can be ported freely. |
| **editly** — [mifi/editly](https://github.com/mifi/editly) | MIT · 5.6k★ · 2025-05 | Declarative JSON → video (Node + ffmpeg) | **JSON spec shape**; transition list (it uses gl-transitions). |
| **Remotion** — [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | Source-available · 69k★ | React → video; paid licence for editor products | Not used. |
| **OpenShot** — [OpenShot/openshot-qt](https://github.com/OpenShot/openshot-qt) | GPL | Desktop NLE | Ideas only. |

#### Building-block libraries

| Library | Licence | Role in VlogUp |
|---|---|---|
| [Mediabunny](https://github.com/Vanilagy/mediabunny) | MPL-2.0 · 7.4k★ | **Core**: decode, encode, mux via WebCodecs |
| [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) | MIT · 17.9k★ | Fallback only |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Apache-2.0 | Face and pose detection, selfie segmentation (tasks-vision web) |
| [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) | MIT/Apache | Voice denoise model; browser wasm wrapper [workadventure/noise-suppression](https://github.com/workadventure/noise-suppression) (MIT) |
| [RNNoise](https://github.com/xiph/rnnoise) | BSD-3 | Lighter denoise fallback; wasm builds [jitsi/rnnoise-wasm](https://github.com/jitsi/rnnoise-wasm) and [shiguredo/rnnoise-wasm](https://github.com/shiguredo/rnnoise-wasm) (Apache) |
| [ebur128-wasm](https://www.npmjs.com/package/ebur128-wasm) | npm package | LUFS and true-peak measurement |
| [Meyda](https://github.com/meyda/meyda) | MIT | Audio features: RMS, spectral flux for energy and onsets |
| [realtime-bpm-analyzer](https://github.com/dlepaux/realtime-bpm-analyzer) | Apache-2.0 | BPM and beats |
| essentia.js | AGPL | Avoid |
| aubio | GPL | Avoid |
| [transformers.js](https://github.com/huggingface/transformers.js) | Apache | Whisper with word timestamps on device |
| gl-transitions | MIT | GLSL transition shaders (via editly/Omniclip) |
| PixiJS | MIT | WebGL compositor |

#### Commercial products

| Product | Approach | Lesson for VlogUp |
|---|---|---|
| **Descript Underlord** | Chat agent over text-based editing | Users complain of cuts mid-word, audio desync, credit burn ("800 credits in 2 days"), and that manual work became faster. **Snap cuts deterministically, keep the cost visible, make partial fixes.** |
| **Eddie AI** | Rough cut with a story arc, built segment by segment in chat; b-roll pass; XML to NLEs | **Segment-by-segment review**. Criticised for robotic pacing and being desktop only. |
| **Gling** | Bad takes, silences and fillers on talking heads | **Bad-take detection** is the killer feature for vloggers. |
| **Opus Clip** | Long → shorts with virality scores and reframing | Users complain about poor context judgement and jarring cuts. Keep the human in the loop for hooks. |
| **CapCut / InShot** | Manual, template-driven; AI captions and reframe | Our UI baseline; templates and SFX are expected. |
| **Mosaic** (YC W25, "Cursor for video") | Node canvas of agent steps plus a timeline; NLE export | Branching variants (A/B edits); exporting to NLEs. |
| **Kapwing, VEED, Captions.ai, Runway, Adobe Premiere AI, Recut, TimeBolt** | Cloud captions, silence removal, generative fills, and AI features inside Premiere | Not re-verified this session; all cloud or desktop; none phone-first, open source and BYO-key. |

#### Research

| Paper | Finding | Reuse |
|---|---|---|
| **LAVE** ([arXiv 2402.10294](https://arxiv.org/abs/2402.10294)) | Visual narrations from a VLM let the LLM "see"; plan-and-execute agent plus direct manipulation | **Visual narration per scene**. |
| **ExpressEdit** ([expressedit.kixlab.org](https://expressedit.kixlab.org/)) | Natural language plus sketch on the frame; parses temporal, spatial and operation references | **v2**: tap or draw on the preview to say "here". |
| **Timeline-Bench** ([arXiv 2609.35143](https://arxiv.org/html/2609.35143)) | The best agent solved 15/56 real editing tasks | Agents are still weak at full edits, so constrain them with tools and verification. |
| **VlogReward** ([arXiv 2607.22632](https://arxiv.org/abs/2607.22632)) | Scores vlog edit plans on pacing, narration, cinematography and more | A rubric for our self-check pass. |
| **AgenticVBench** ([arXiv 2605.27705](https://arxiv.org/pdf/2605.27705v1)) | Benchmark for post-production agent tasks | — |

### Recommended base
- **Decision: build a new mobile-first app (no fork). Borrow MIT code and patterns from proven projects.**
- Why not fork OpenCut?
  - It is mid-rewrite (Rust core) and not accepting contributions; classic is frozen.
  - Next.js plus a server is a poor fit for GitHub Pages.
- Why not fork Omniclip?
  - Desktop layout; Lit plus PixiJS 7 plus older ffmpeg/mp4box; slow release cadence.
- Why not fork Timeline Studio, the closest stack?
  - Huge desktop-first codebase with avatars, deep-synthesis, Chinese TTS, Jianying export and a model-licence tangle.
  - We'd spend months deleting.
  - We lift its Mediabunny export and transformers.js patterns (MIT) instead.
- Why build our own?
  - Our differentiators (thumb-zone mobile layout, AI tool layer, three-tier pro engine) are exactly the parts no fork gives us.
  - The heavy lifting is already in libraries: Mediabunny, PixiJS, MediaPipe, DeepFilterNet wasm, transformers.js.
- **Reuse map:**
  - Mediabunny (engine);
  - Timeline Studio (export/AI wiring reference);
  - Cutboard (typed tool API and op log);
  - auto-editor (silence algorithm);
  - editly, gl-transitions and Omniclip (transitions and filters);
  - OpenReelio (QC pass);
  - LAVE (visual narration).

### Professional editing engine
Tiers:
- **[A] Analyse once:** background worker, cached.
- **[P] Live preview:** proxy plus WebGL.
- **[X] Bake at export:** full quality.

#### 1. Pacing and rhythm
| Feature | Implementation | Version |
|---|---|---|
| Speech-energy pacing | RMS plus spectral flux (Meyda) plus word rate → "energy curve"; the AI trims low-energy stretches [A] | **v1** |
| Cut to beat | realtime-bpm-analyzer (Apache) or our own onset detector → beat grid; cut points snap to the nearest beat within ±150 ms [A] | **v1** |
| Pattern interrupts | Rule engine: if no visual change for N s (preset 3–6 s), insert a punch-in, b-roll, text pop or SFX | **v1** |
| J/L cuts | Audio and video items have independent in/out points; tool `jlCut(cutId, audioLeadMs)`; Web Audio crossfade [P][X] | **v1** |
| Section-aware pacing | Faster in the hook, slower in the payoff | v2 |

#### 2. Transitions
| Feature | Implementation | Version |
|---|---|---|
| Crossfade, dip-to-black, zoom-in/out, whip pan (directional blur plus offset), glitch (RGB split plus slice noise), light leak (additive gradient/texture overlay) | GLSL shaders (gl-transitions style) in PixiJS; cheap enough for live preview [P] | **v1** |
| Match cut | Vision suggests candidates (keyframe similarity via MediaPipe embedder or a small CLIP in transformers.js); the user confirms | v2 |
| Rule | The AI places transitions sparingly; jump cuts are the default for talking heads | — |

#### 3. Colour
| Feature | Implementation | Version |
|---|---|---|
| Auto white balance and exposure | Per-clip stats from keyframes (grey-world plus luminance histogram) → lift, gamma, gain and temperature uniforms [A][P] | **v1** |
| Shot matching | Match each clip's mean and variance in Lab space to a reference clip (Reinhard transfer) → per-clip correction [A] | **v1** |
| LUT looks | WebGL2 3D-texture `.cube` LUTs; 6–8 bundled CC0 looks (Warm Travel, Teal-Orange, Clean, Moody, Film, B&W); strength slider [P] | **v1** |
| Skin-tone protection, HSL secondaries | MediaPipe face mask | v2 |

#### 4. Motion
| Feature | Implementation | Version |
|---|---|---|
| Ken Burns on stills | Transform keyframes (scale/translate easing) [P] | **v1** |
| Punch-in on emphasis | Words flagged by the AI or high-energy peaks → 110–120% scale for 0.5–2 s, centred on the face [P] | **v1** |
| Smart reframe 16:9→9:16 | MediaPipe Face Detector at about 5 fps on the proxy [A]; Kalman/EMA-smoothed crop path; dead-zone to avoid jitter [P] | **v1** |
| Speed ramps | Time-remap curve on the clip; video frame picking; audio muted or pitch-kept through Web Audio (playbackRate) [P][X] | **v1** (simple ramps) |
| Stabilisation | Feature tracking | later (native) |
| Pose or object tracking for stickers | MediaPipe | v2 |

#### 5. Audio
| Feature | Implementation | Version |
|---|---|---|
| Voice denoise | DeepFilterNet3 wasm (AudioWorklet, about 11 MB lazy download) run offline in a worker over the dialogue track [A/X]; preview uses the cached cleaned audio. Fallback: RNNoise wasm on low-end phones. | **v1** |
| Voice EQ and compression | Web Audio BiquadFilter (HPF 80 Hz, presence +3 dB at 3–5 kHz, de-mud cut at 300 Hz) plus DynamicsCompressor [P][X] | **v1** |
| Loudness to −14 LUFS, −1 dBTP | ebur128-wasm measure → gain plus limiter at export [X] | **v1** |
| Music ducking | Sidechain from the speech VAD envelope → music gain automation (−12 to −18 dB, 200 ms attack, 500 ms release) [P][X] | **v1** |
| Beat sync of music to cuts | Uses the beat grid from 1 | **v1** |
| SFX library | About 40 bundled CC0 sounds (whoosh, pop, riser, click, swoosh, ding, bass hit); auto-placed on transitions, text pops and punch-ins, with density set by the preset | **v1** |
| Dereverb | Desert Ant Clear model; check its custom licence first | v2 |
| Music stem separation | — | later |

#### 6. B-roll
| Feature | Implementation | Version |
|---|---|---|
| Place b-roll over talking segments | Clips tagged as b-roll (no speech, or user-marked); the AI matches b-roll to transcript topics using LAVE-style visual narrations (vision model on 1 keyframe per scene); places it on the overlay track with the voice continuing (L-cut) | **v1** (the user's own clips) |
| Stock b-roll search (Pexels API) | — | v2 |

#### 7. Text and graphics
| Feature | Implementation | Version |
|---|---|---|
| Animated captions | Word timestamps → 1–3-word cards; styles: Clean, Bold Pop (scale-in), Karaoke (active-word colour), Boxed; **keyword highlight** (AI-chosen words coloured or enlarged); optional emoji after key words; face-safe placement (avoid the MediaPipe face box) [P] | **v1** |
| Animated titles, lower thirds | 8–10 parametric templates (Canvas2D/PixiJS text plus GSAP-style easing in our own tween code) [P] | **v1** |
| Intros and outros | 3 templates each (title card, subscribe/CTA end card) using the channel name and colour | **v1** |
| Custom motion graphics written by the AI (Cutboard-style sandboxed scene tree) | — | v2 |

#### 8. Story structure and selection
| Feature | Implementation | Version |
|---|---|---|
| Hook / setup / payoff / CTA | The AI labels transcript segments → reorders; a 3-second hook rule (strongest line or visual first) | **v1** |
| Best-moment detection | Score = transcript salience (LLM) + audio energy + laughter/applause cues + visual change + face presence [A] | **v1** |
| Bad and repeated takes | Fuzzy match of consecutive transcript sentences (keep the last complete take, like Gling/OpenStoryline) + filler and stutter detection + energy | **v1** |
| Boring stretches | Low energy plus low visual change plus low salience → trim suggestions | **v1** |
| Vision "boring shot" check (blur, darkness, shake) | — | v2 |

#### 9. Edit style presets (parameter bundles; neutral names)
| Preset | Parameters |
|---|---|
| **Fast Daily** (Casey-Neistat-like) | Interrupt every 2–3 s, jump cuts, whip and speed ramps, punchy SFX, bold captions, high-contrast grade |
| **Cinematic Travel** | Beat-synced b-roll, J/L cuts, light leaks, teal-orange LUT, minimal captions, music-forward mix |
| **High-Retention** (MrBeast-style) | Hook in 3 s, interrupt every 1.5–3 s, keyword-highlight captions with emoji, frequent zooms, SFX on every text, energetic grade |
| **Calm Aesthetic** | Long takes, crossfades, soft film LUT, small serif captions, quiet ducked lo-fi music |

- Status: **v1** (4 presets). "My Style", learned from the user's corrections, comes in v2.

#### Auto-QC pass before Done (v1)
- Checks:
  - no cut mid-word;
  - no black frames or flash frames;
  - no clipping;
  - LUFS within ±1 dB;
  - captions inside safe zones and not over faces;
  - no gaps on the timeline.
- Failures are auto-fixed or listed.

#### Phone performance reality
- Analysis of a 10-minute vlog on a mid-range Android: aim for under 3 minutes (proxy plus audio first; faces at 5 fps on the proxy; DeepFilterNet in a worker).
- Live preview: proxy at up to 720p30 with at most 2 shader passes plus the caption layer; heavier looks are shown at reduced quality.
- Export of 1080p30 through hardware H.264: aim for 1–2× real time on recent phones. 4K is v2 or native only.
- On low-end devices or iOS memory pressure, auto-downgrade to:
  - RNNoise instead of DeepFilterNet;
  - 540p proxies;
  - fewer shader passes.

### MVP v1 features (revised)
- **Import:**
  - clips and photos in order;
  - drag to reorder;
  - mark clips as A-roll or B-roll (auto-guessed from speech presence).
- **Analysis:** proxy, word transcript, silences, fillers, repeated takes, scenes plus keyframes, visual narration per scene, faces, energy curve, beats, LUFS, colour stats.
- **Timeline:** video, overlay/b-roll, captions/text, voice, music and SFX tracks; manual trim, split, delete, reorder, volume and speed.
- **AI chat sheet:**
  - typed tool-calling;
  - a one-line plan;
  - Done, change list, Before/After;
  - partial fixes;
  - versions and undo.
- **Pro engine v1 (see above):**
  - rhythm: energy, beat, interrupts, J/L;
  - transitions: 6 shader transitions;
  - colour: auto WB/exposure, shot match, LUTs;
  - motion: Ken Burns, punch-ins, smart reframe, simple ramps;
  - audio: denoise, EQ/compression, −14 LUFS, ducking, SFX;
  - b-roll from the user's own clips;
  - captions: animated, with keyword highlight and emoji;
  - titles, lower thirds, intro/outro;
  - story: hook, best moments, bad takes;
  - 4 presets;
  - auto-QC.
- **Quick chips (DSP-only where possible, so free):**
  - Remove silences;
  - Cut bad takes;
  - Captions;
  - Clean voice;
  - Add music + duck;
  - Hook first 3s;
  - Make Short 9:16;
  - Apply look.
- **Music:** bundled CC0 library or the user's own file (e.g. Suno); **SFX:** bundled CC0 pack.
- **Export:** 16:9 and 9:16 together, 720p/1080p MP4.
- **Providers:** BYO key for Grok, Claude or ChatGPT; cost meter.
- **App:** installable PWA with an install button on the first screen; English UI; offline after first load.

### v2 / later
- Learned "My Style" and "save this edit as a style" (OpenStoryline-like).
- Copy the rhythm and grade from a reference video (Cutboard-like).
- Match cuts, AI-written custom motion graphics, stock b-roll (Pexels), dereverb, stem separation.
- Draw or tap on the preview to target edits (ExpressEdit-like).
- Variants: generate 2–3 alternative edits side by side (Mosaic-like).
- Voice prompts, auto chapters, titles and thumbnails for YouTube.
- Optional Supabase sync of settings and styles (no footage).
- Capacitor native wrapper: 4K, stabilisation, background export, bigger memory.
- Local LLM mode (Ollama / on-device).
- OTIO/FCPXML export for Resolve and Premiere.
- An MCP endpoint so external agents can drive VlogUp.

### Screen layout (top to bottom)
- **Top bar:** Back · project name · version ▾ · Style preset ▾ · **Export**.
- **Preview** (about 35% height, shrinks when the chat is expanded): tap to play/pause; hold for Before/After.
- **Tool row** (scroll): Canvas · Audio · Voice FX · Music · SFX · Text · Captions · Transitions · Color · Motion · Speed · Split.
- **Timeline:**
  - multi-track, pinch-zoom;
  - beat-grid ticks;
  - transcript strip toggle;
  - **+ Add clips**.
- **AI chat bottom sheet** (thumb zone; collapsed, half or full), with chips above the input.
- The **Done** banner shows ▶ Play · Changes (n) · Undo · Export.
- The provider badge (Grok / Claude / ChatGPT) plus the cost meter sit in the chat header.

### AI capabilities from chat (v1)
- **Tool groups** (typed, schema-validated; the LLM never invents timestamps; it references segment, word and scene IDs from the analysis):
  - `cut / trim / split / move / delete` by IDs;
  - `removeSilences(level)`, `removeFillers()`, `removeBadTakes()`;
  - `setPacing(preset | interruptEverySec)`, `snapCutsToBeats()`, `jlCut()`;
  - `addTransition(type, at)`, `punchIn(wordId | time, scale)`, `kenBurns(itemId)`, `speedRamp(itemId, curve)`, `reframe(aspect, mode)`;
  - `colorAuto(itemIds)`, `matchShots(refId)`, `applyLook(lut, strength)`;
  - `cleanVoice(level)`, `setLoudness(-14)`, `addMusic(trackId)`, `duck(depth)`, `addSfx(type, at | auto)`;
  - `placeBroll(topic | segmentIds)`;
  - `captions(style, highlightKeywords, emoji)`, `addTitle(template, text)`, `lowerThird()`, `intro()`, `outro()`;
  - `buildStory(hook, setup, payoff, cta)`, `shortenTo(seconds)`, `makeShort()`;
  - `applyPreset(name)`, `explain()`, `runQC()`.
- **Agent loop:**
  - plan → tool calls → deterministic snap and validation → auto-QC → Done;
  - on feedback: locate the segments → patch only those → new version.
- **Context sent per round:**
  - transcript (compressed);
  - segment table with scores;
  - scene narrations;
  - current timeline JSON diff;
  - the user message.
- Keyframes are sent only on request.

### Tech stack and architecture
- **Frontend:** TypeScript + Vite + Preact (or React for borrowing from Timeline Studio), Zustand-like store, PWA on GitHub Pages via Actions.
- **Engine layers:**
  - **Media I/O:** Mediabunny (WebCodecs); ffmpeg.wasm as a lazy fallback.
  - **Compositor:** PixiJS (WebGL2) with GLSL shader modules for transitions, colour/LUT and transforms; Canvas2D text and caption atlas.
  - **Audio:** Web Audio graph (EQ, compressor, ducking automation) plus OfflineAudioContext for the export mix; AudioWorklet wasm for DeepFilterNet/RNNoise; ebur128-wasm.
  - **Analysis workers:** Meyda (energy/onsets), realtime-bpm-analyzer (beats), MediaPipe tasks-vision (faces), transformers.js Whisper (words), scene diff, colour stats; results cached in IndexedDB.
- **Data:** one versioned timeline JSON plus an append-only op log (Cutboard pattern), giving exact undo, crash recovery and diffs for the AI.
- **AI layer:**
  - provider adapters (xAI / Anthropic / OpenAI) mapping one internal tool schema;
  - zod validation;
  - the deterministic "snapper" (word, zero-crossing, beat);
  - the QC module.
- **Storage:** OPFS for media, proxies and baked audio; IndexedDB for projects, versions and caches.
- **Optional proxy:** a Cloudflare Worker / Supabase Edge Function template, for CORS problems only.
- **Licence:** MIT. Dependencies are MIT, Apache, BSD or MPL only; AGPL/GPL projects are used as ideas only.

### Privacy, keys and cost model
- Footage never leaves the device. The AI gets text summaries plus a few small keyframes (only for b-roll matching or on request).
- Keys are BYO, device-only (optional passcode encryption), never sent anywhere except the provider or the user's own proxy; strict CSP, no third-party scripts.
- No VlogUp servers, no ads, free.
- **Cost per AI round** (estimate):

  | Model tier | Cost per round |
  |---|---|
  | Small/fast model | about $0.01–0.03 |
  | Top model | about $0.10–0.25 |
- **One-time analysis:**
  - visual narration, about 1 keyframe per scene: about $0.01–0.05 per 10-minute vlog with a small vision model;
  - transcription: $0 on device, or about $0.003–0.006 per minute via API.
- DSP chips (silences, clean voice, loudness, ducking, reframe) are **free**: no LLM call.
- A cost meter shows the cost per round and per project.

### Known limits and risks, with mitigations
- **Phone memory, 4K, iOS crashes:**
  - proxies, chunked streaming;
  - tiered engine with auto-downgrade;
  - 4K in v2 or native.
- **iOS needs 26+ for WebCodecs; Firefox Android has none:**
  - feature-detect and show clear messages;
  - fall back to ffmpeg.wasm for short clips.
- **AI-made bad edits (Underlord-style complaints):**
  - IDs, not timestamps;
  - deterministic snapping, handles and crossfades;
  - auto-QC; partial fixes;
  - versioning; a visible change list.
- **"Over-edited" look (too many effects):**
  - presets cap density;
  - the QC flags more than N effects in 10 s;
  - the vlogger rule: jump cuts and captions first, effects second.
- **Heavy model downloads (DeepFilterNet about 11 MB, Whisper about 40–150 MB, MediaPipe about 1–5 MB):**
  - lazy download on first use;
  - cached; shown in Settings.
- **Provider CORS changes (xAI):** health check plus the optional proxy.
- **Key theft:** CSP, no third-party scripts, spend-limit advice.
- **Licence contamination:**
  - a dependency allow-list in CI (license-checker);
  - no copying from AGPL/GPL repos.
- **Music and SFX copyright:**
  - only CC0 or royalty-free bundles, or the user's own files;
  - a licence card per asset.
- **Scope creep:** vlog-only filter; every feature must save a vlogger time.

### Milestones (each ends with a demo)
- **M1: Core editor on phones (about 2 weeks).**
  - PWA shell; import, order, reorder; timeline; trim, split; proxy pipeline; PixiJS preview; 720p/1080p export via Mediabunny on Android Chrome and iOS 26.
  - **Demo:** 3 clips → trim → export a working MP4 on a phone.
- **M2: Analysis plus pro audio and captions.**
  - Whisper words, silences, fillers, bad takes, energy, beats, faces, colour stats.
  - Denoise, EQ/compression, −14 LUFS, ducking, SFX pack, animated captions with keyword highlight.
  - DSP chips with no AI.
  - **Demo:** one tap on "Clean voice + Remove silences + Bad takes + Captions" turns a noisy raw vlog into a clean, tight, captioned, loud-enough edit.
- **M3: Pro visuals.**
  - 6 shader transitions, auto colour plus shot match plus LUTs, Ken Burns, punch-ins, smart 9:16 reframe, speed ramps, titles, lower thirds, intro/outro, b-roll overlay track with J/L cuts.
  - **Demo:** a manually built "cinematic" edit with a grade, transitions and reframe, exported in both formats.
- **M4: AI editor.**
  - Provider keys (Grok, Claude, ChatGPT); typed tools; snapper; plan → Done → change list → Before/After; partial-fix loop; 4 style presets; story builder (hook, setup, payoff, CTA); auto-QC; cost meter.
  - **Demo:** "Make a High-Retention 60-sec Short with a strong hook" → Done → "keep the coffee part, less zoom" → fixed → export.
- **M5: Polish and launch v1.0.**
  - Onboarding, performance auto-downgrade, README with before/after demos, optional proxy template, licence CI, public release.
  - **Demo:** a public repo plus a live PWA, with one real vlog edited end to end on a phone in under 10 minutes of user time.

## Research notes (2026-10-31)
- Platform facts carried over from v0.1:
  - WebCodecs: Safari/iOS 26+.
  - ffmpeg.wasm: 2 GB limit, iOS crashes.
  - Anthropic: CORS header required.
  - OpenAI: CORS ok but opaque errors.
  - xAI: CORS flip-flopped in 2026.
  - Remotion: paid licence for editor products.
- GitHub searches run:
  - "ai video editor", "llm video editing", "prompt video edit", "agentic video editing", "video editing agent", "mcp video editing", "ffmpeg llm", "auto vlog editor", "chat video editor".
  - In the results, 2026 is crowded with desktop/Electron chat editors and Claude-Code skill packs. **None is a phone-first web app** with BYO keys.
- MCP servers: [burningion/video-editing-mcp](https://github.com/burningion/video-editing-mcp) (Video Jungle cloud, no licence) and [misbahsy/video-audio-mcp](https://github.com/misbahsy/video-audio-mcp) (MIT, ffmpeg). These are ideas for a future VlogUp MCP endpoint.
- Descript complaints: Reddit r/Descript (Aug 2026), Descript Canny (Feb 2026), Trustpilot.
- Mosaic: Launch HN (YC W25); a $3.8M seed.
- Eddie: Filmora review ("robotic pacing", desktop only).
- Kapwing, VEED, Captions.ai, Runway, Premiere AI, Recut and TimeBolt: summarised from general knowledge; not re-verified this session.
