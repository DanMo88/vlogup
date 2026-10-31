# VlogUp Template Schema v1.0 (edit recipes)

- File: `template.schema.json` (JSON Schema draft 2020-12). All 16 starter templates in this folder validate against it.
- A **template** is an *edit recipe*, not a timeline:
  - no fixed clip count and no fixed song;
  - timings are given in **beats, bars, sections or fractions**, and the compiler resolves them against the user's music and footage.
- Licence of every built-in recipe: **MIT** (our own original recipes, modelled on *styles*, never copied from proprietary templates).

## Design principles
- **Music-agnostic**:
  - rhythm uses `beatsPerCut`, `cutOn` (beat, downbeat, bar, phrase, speech) and section lengths in beats or bars;
  - with no music, the compiler falls back to speech or a virtual 120 BPM grid.
- **Clip-count-agnostic**:
  - sections hold **slot rules** (what kind of shot to pick), not fixed slots;
  - `minClips`, `idealClips` and `maxClips` guide the AI;
  - `reuse` decides whether short footage may repeat clips.
- **Two layers**:
  - `stylePrompt` is the natural-language brief that seeds the AI;
  - the structured recipe is the source of truth, and **the recipe wins on conflicts**.
- **Deterministic first**: the template compiler does all the timing maths. The LLM only judges:
  - which clip goes into which slot;
  - the hook choice;
  - title and label text;
  - keyword picks.
- **Safe by construction**:
  - assets are referenced by bundled ids (`assets.*`), so every template can be licence-checked in CI;
  - templates cannot load remote files.

## Top-level fields (headline view)
| Field | Purpose |
|---|---|
| `schemaVersion`, `id`, `name`, `description`, `category`, `tags` | Identity and gallery metadata |
| `license`, `author`, `origin` | `builtin`, `user-saved`, `reference-match` or `community` |
| `inspiredBy` | A generic style description only (e.g. "beat-sync trend edits"), never a template name or asset |
| `preview` | Thumbnail and demo clip (rendered from CC0 demo footage) |
| `stylePrompt` | The 40–1200 character brief the AI receives |
| `aiHints` | Short judgement rules for selection |
| `format` | `aspect`, `alsoExport`, `duration.mode` (`fit-music`, `fit-footage` or `target`), `fps` |
| `footage` | `kind` (montage, talking or mixed), clip counts, photo policy, reuse, `orderPolicy` |
| `music` | Mood tags, BPM range, energy curve, start point, fades, volume, ducking depth, end on phrase |
| `rhythm` | Cut grid, beats per cut (number or [min,max]), shot limits, pattern interrupts, jump cuts, silences, fillers, bad takes, J/L cuts, snap tolerance |
| `structure[]` | Ordered **sections** (see below) |
| `transitions` | Default, weighted palette, section-change and drop transitions; max per 10 s; avoid on faces |
| `color` | Auto-correct, shot match, LUT id plus strength, adjust sliders, overlays (grain, light leak, scanlines), letterbox, skin protection |
| `motion` | Reframe, Ken Burns, punch-in (trigger, scale, max), speed ramps, shake, stabilise (hint) |
| `captions` | Mode, style, font, case, words per card, position, face-safe, colours, keyword highlight, emoji, animation |
| `textOverlays[]` | Titles, location, date, time stamps, labels, counters, lower thirds and CTAs, with text source and animation |
| `sfx` | Density plus cues: `{on: event, sound: id, gainDb, offsetMs, probability}` |
| `audio` | Original audio policy, voice cleaning, voice EQ, target LUFS, true peak |
| `intro`, `outro` | Bookends: cold open, title card, hook montage, end card, subscribe card, loop to start, freeze frame… |
| `constraints` | Max effects per 10 s, min clip quality, avoid list |
| `assets` | All bundled LUT, SFX, font, overlay and music-tag ids used (preload plus licence CI) |

## Sections (`structure[]`)
- `role`: hook, intro, setup, body, build, drop, payoff, montage, reveal, cta or outro.
- `length`: exactly one of `beats`, `bars`, `sec`, `fraction` or `rest:true`, plus optional `flex` (0 = rigid, 1 = elastic).
- `slots`:
  - `pick` lists shot types in priority order: best-moment, establishing-wide, detail-closeup, face, talking, action, motion-high, motion-low, scenic, food, people-group, night-lights, product, transition-friendly, golden-hour or any;
  - `count`: `auto` or a number;
  - `clipIn` sets the in point: `peak-motion`, `speech-start`, `best-frame`…;
  - `allowSpeech`.
- Optional per-section overrides: `beatsPerCut`, `transitionIn`, `speed`, `musicGainDb`, `note`.

## Event vocabulary (SFX cues, ramps, overlays)
- `transition:<type>` or `transition:any`.
- `text-in`, `caption-keyword`, `punch-in`, `speed-ramp`.
- `before-drop`, `drop`, `section:<id>`, `intro`, `outro`.
- Speed-ramp triggers: `drop`, `downbeat`, `section:<id>`, `action`, `clip-start`, `clip-end`, `every:<n>-cuts`.
- Overlay `when`: `always`, `transitions`, `section:<id>` or `random:<p>`.

## How a template is applied (the template compiler)
1. **Analyse**: footage analysis (shot types, faces, motion, speech, quality, time) plus music analysis (BPM, beat grid, downbeats, sections, drop, energy).
2. **Pick music**:
   - the user's track, or a library track matching `mood`, `bpmRange` and `energyCurve`;
   - apply `startAt`.
3. **Resolve the timeline length** from `duration.mode`:
   - `fit-music` ends on a phrase;
   - `fit-footage` sums the useful material;
   - `target` aims for `targetSec`.
4. **Resolve sections**: convert beats, bars and fractions to seconds on the real beat grid, stretching each section within its `flex`.
5. **Fill slots (LLM plus scoring)**: rank clips per slot rule. The LLM picks the hook, the order (`orderPolicy`) and the in points, using clip IDs only.
6. **Emit tool calls**: cuts on the grid, transitions from the palette (weighted, capped), colour, motion, captions, overlays, SFX cues, audio chain.
7. **Snap and QC**: snap to words, zero crossings and beats, then run the auto-QC (effect density, face-safe text, LUFS, no mid-word cuts).
8. **Done**: the result plays, with a change list. Follow-up chat edits are normal partial fixes. Changing the template re-runs steps 4–7 and keeps the user's manual locks.
- The user can add a prompt on top, e.g. "Cinematic Travel, but no letterbox and keep my voice". The AI turns that into **recipe overrides** (a JSON patch), shown as chips the user can remove.

## Template suggestions ("the AI recognises the style")
- After analysis, VlogUp suggests the top 3 templates from:
  - footage kind (talking vs montage);
  - detected content (food, night, nature, party, gym);
  - clip count and photo ratio.
- v1 uses heuristics plus one small LLM call.
- Tapping a template shows its `stylePrompt` in the chat ("Here's the plan…"), so the user sees what will happen and can edit it before Apply.

## Save my edit as a template (v1, M4)
- On any finished project: **⋯ → Save as template**.
- Serialise the project's *parameters*, not its media:
  - measured cut rhythm as beats per cut per section (median and range);
  - transitions used (weighted palette);
  - LUT, strength and adjust values;
  - caption style, fonts and text overlay styles;
  - SFX cues by event;
  - speed-ramp patterns;
  - punch-in frequency;
  - music mood and BPM.
- The LLM writes `name`, `description` and `stylePrompt` from the edit history and chat ("what the user asked for").
- Stored locally as `origin: user-saved`. Export/import as a `.vlogup-template.json` file to share. A v2 community gallery comes through GitHub PRs.
- Feeds "My Style": the user's saved templates are blended into suggestions.

## Match a reference video
- **v1.1 (after the v1 launch, upload a file only):**
  - the user uploads a video they have (e.g. a saved or screen-recorded vlog they like);
  - analysis runs **on device** with the same engine;
  - nothing from the reference is reused in the output.
- **Extracted in v1.1, each with a confidence score:**
  - cut points (scene-change detection) → shot-length distribution per section;
  - beat grid of its audio → cut-to-beat alignment → `cutOn` and `beatsPerCut`;
  - pacing curve (shots per 10 s over time) → sections and roles;
  - colour statistics (Lab mean and variance, highlight and shadow tint, saturation, contrast, grain estimate) → a **generated LUT** (Reinhard-style transfer, our own data) plus adjust values;
  - letterbox and aspect detection;
  - captions and text: a vision model on sampled frames describes position, case, words per card, colours, highlight use, emoji, and font *category* (condensed sans, serif, handwritten, pixel), then maps it to our closest bundled OFL font;
  - speech vs music share → `footage.kind`, ducking, `originalAudio`.
- **v2 (harder):**
  - transition classification around cuts (flash/whip/zoom/crossfade/glitch from frame-difference signatures plus vision);
  - speed-ramp detection (optical-flow speed curves);
  - zoom/punch-in detection;
  - SFX event detection (onset classification);
  - text animation style.
- **Links (TikTok/YouTube/Instagram URLs): not planned.** Downloading from these platforms conflicts with their terms and CORS. The user must supply a file they have the right to use for analysis.
- **Output:** a draft template (`origin: reference-match`). The user previews it on their own clips, tweaks it, then saves.
- **Ethics and copyright:**
  - we copy *measurable style parameters* only, never footage, music, fonts, graphics or text;
  - the app reminds users not to impersonate other creators' branding.
