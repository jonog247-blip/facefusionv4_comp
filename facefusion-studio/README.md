# FaceFusion Studio

A client for the **FaceFusion v4 API**. It runs entirely in the browser against an unmodified
`python facefusion.py api` server — no Python file, model, ONNX runtime or engine behaviour is
touched. Everything the studio adds (multi-angle pose routing, capabilities-driven controls,
split comparison, live streaming) happens on this side of the wire.

```
┌─ FaceFusion Studio (React 19 + Vite + Three.js) ─┐        ┌─ FaceFusion v4 (stock) ─┐
│  MediaPipe face landmarker  ·  WebGL head  ·  UI   │ ─────► │  /session /state /assets │
│  pose router · job composer · SDP negotiation      │ ◄───── │  /jobs /stream /metrics   │
└───────────────────────────────────────────────────┘        └───────────────────────────┘
```

---

## Quick start

```bash
# 1 — the engine (unmodified v4 branch)
python facefusion.py api --api-session-limit 8      # defaults to 127.0.0.1:8000

# 2 — the studio
cd facefusion-studio
npm install
npm run dev                                        # http://localhost:5173
```

Production build:

```bash
npm run build        # → dist/, a plain static bundle
npm run preview
```

The bundle is static: serve it from any web server, or open it next to the API. CORS is already
open (`allow_origins = ['*']` in `facefusion/apis/core.py`), so no proxy is required.

If no server answers at boot, the studio falls back to a **built-in demo backend** that speaks the
same contract, so the interface can be reviewed without a GPU. The top bar says `demo backend`
whenever that happens. Force one mode or the other with `VITE_FF_TRANSPORT=live|demo|auto`.

---

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_FF_API_BASE` | `http://127.0.0.1:8000` | Base URL — matches `--api-host` / `--api-port` |
| `VITE_FF_API_KEY` | – | Sent as `api_key` only when the server sets `FACEFUSION_API_KEY` |
| `VITE_FF_TRANSPORT` | `auto` | `auto` probes the server, then falls back to the demo backend |
| `VITE_FF_LANDMARKER_URL` | CDN | Override for the MediaPipe `.task` model |

The endpoint can also be changed at runtime from the gear menu in the top bar (stored in
`localStorage`, survives reloads).

**Offline landmarker.** The WebAssembly runtime is copied out of `node_modules` into
`public/mediapipe` on dev start and on build. The model itself (~3.7 MB) is fetched from the
MediaPipe CDN; drop `face_landmarker.task` into `public/models/` to serve it locally, or point
`VITE_FF_LANDMARKER_URL` at your own copy. Without a model the studio still works — angles fall
back to manual entry and the UI says so instead of inventing numbers.

---

## API coverage

Every endpoint of the v4 contract is wired, and each one is reachable from the interface:

| Endpoint | Where it is used |
| --- | --- |
| `GET /` | Boot probe; server name and version in the top bar |
| `GET /capabilities` | Builds the entire inspector (see below) |
| `POST /session` | `api.openSession()` — returns `access_token` + `refresh_token` |
| `GET /session` | Session probe after rotation |
| `PUT /session` | Rotation at 70 % of the 10 minute lifetime |
| `DELETE /session` | Teardown and asset cleanup |
| `WS /ping` | Liveness socket (subprotocol `access_token.<token>`) |
| `GET /state` | Inspector values |
| `PUT /state` | Every inspector control, with optimistic local echo |
| `PUT /state?action=select&type=source` | Multi-angle source routing |
| `PUT /state?action=select&type=target` | Target selection in the asset tray |
| `GET /assets` | Asset rail, output detection |
| `POST /assets?type=source\|target` | Uploads (multipart, repeated `file` parts) |
| `DELETE /assets`, `DELETE /assets/{id}` | Per-asset and bulk removal |
| `GET /assets/{id}` | Asset metadata |
| `GET /assets/{id}?action=download` | Thumbnails, preview, save |
| `GET /assets/{id}?action=capture` | Contact-sheet capture (`subject=frame\|face`, `frame_index`) |
| `GET /jobs?status=…` | Job history (all four statuses, merged) |
| `POST /jobs` | Job creation |
| `POST /jobs/{id}?action=add` | Step from the current state |
| `POST /jobs/{id}/{index}?action=insert\|remix` | Step editing |
| `DELETE /jobs/{id}/{index}` | Step removal |
| `PATCH /jobs/{id}?action=submit\|run\|retry` | The render button, per job and bulk |
| `GET /jobs/{id}` | Step polling while a job runs |
| `DELETE /jobs`, `DELETE /jobs/{id}` | Cleanup |
| `POST /stream` | WebRTC — raw SDP, `application/sdp`, `201` with the answer |
| `DELETE /stream` | Stream teardown |
| `WS /stream` | Single-image processing loop |
| `GET /metrics`, `WS /metrics` | System panel, pushed every 2 s |

### Session handling

A session lives 10 minutes and both tokens share that expiry. The transport rotates at 70 % of the
lifetime, and — more importantly — reacts to the two failure modes the server actually returns:

* `401` — token missing or unknown → open a new session and retry the request once.
* `426 Upgrade Required` — the token is known but the session expired → same recovery path.

A failed request is never retried twice, and concurrent 401s share a single recovery.

### WebRTC specifics

The engine has **no trickle ICE and no STUN/TURN**, so the studio waits for
`icegatheringstate === 'complete'` (2.5 s cap) before the offer leaves the browser, and sends the
gathered `localDescription.sdp`. Send and receive transceivers are offered separately, video first.
The client reaches the server directly — if you proxy the API, proxy the UDP candidates too.

---

## The inspector is generated, not written

`GET /capabilities` returns `arguments` grouped by section (`processors`, `face_detector`,
`face_swapper`, `output_creation`, …), each with a `default`, optional `choices` and the
`groups` it belongs to. `src/components/inspector/` turns that into controls without a single
hard-coded option:

| Value shape | Control |
| --- | --- |
| `processors` (list) | chip multi-select |
| list of strings | chip multi-select |
| short list of strings | select |
| numeric `choices` | slider over the real min/max/step |
| boolean | switch |
| list of numbers | per-component numeric inputs |
| `*_color` | colour picker writing `[r, g, b, a]` |
| no `choices` | free text field |

Anything the running build supports appears automatically — new processors, new models, new
execution providers. The filter box searches across all 91 options of a stock build.

---

## Multi-angle pose router

The problem it addresses: a frontal source portrait has to be affinely warped onto a target face
that is turned 60°, and the result degrades at the jaw and ear boundary.

The fix stays on the client:

1. Each uploaded source photo is measured **in the browser** by the MediaPipe face landmarker.
   `facialTransformationMatrixes[0]` gives a rigid 4×4 fit → exact pitch/yaw/roll; the landmark
   cloud provides a geometric fallback and fixes the sign convention of the matrix.
2. The angles are pinned on a Three.js head, grouped into frontal / ¾ / profile buckets.
3. While a target plays (camera sampler, uploaded video, or the live stream) the client measures
   the target's yaw per frame and keeps a histogram.
4. The router picks the captured angle closest to the current yaw — or the two that bracket it, in
   `blend` mode — and selects those assets through `PUT /state?action=select&type=source`.

FaceFusion then receives a source whose geometry already matches the target frame, and its stock
detector and swapper do the rest. Re-routing is throttled (12° of movement, 1.5 s floor) so a fast
turn does not flood the API with `PUT /state` calls.

Honest limitations, stated in the UI as well:

* Routing changes the **source** handed to the engine. It cannot change how the engine warps, and
  it does not improve a single uploaded photo.
* A job run is one state snapshot: the source selected when the step is added is the source the
  whole run uses. Per-frame routing is only meaningful for the streaming paths, which is why the
  router is described as a live-pipeline feature.
* Coverage is measured, not claimed: the panel reports the share of sampled target frames that fall
  within ±25° of a captured angle, and names the buckets you never photographed.

---

## Responsive layout

| Width | Behaviour |
| --- | --- |
| < 1024 px | Rails become overlay drawers driven by the bottom dock; stage goes full bleed |
| ≥ 1024 px | Both rails pinned (`w-72` / `w-80`), stage flexes |
| ≥ 1440 px | Wider rails, more room for the 3D head |
| ≥ 1920 px | `w-96` rails, metrics and jobs side by side |

Panels never scroll the page horizontally; the body is `overflow: hidden` with `100dvh` so mobile
browser chrome cannot clip the layout.

---

## Demo backend

`src/api/demo.ts` implements the same `FaceFusionApi` interface in memory: session rotation,
capability validation (`400` on an unknown key or an out-of-range value), the asset lifecycle, the
job state machine with per-step progress, an output asset on completion, and both stream
transports. Its capabilities and default state are the **real** payload extracted from the
v4-challenge sources (`src/api/demo/capabilities.json`, 91 options across 23 groups), so the
inspector is exercised against production data.

Frame synthesis is a labelled simulation — a soft composite of the source over the target frame —
because there is no model behind it. The composite is the only faked part of the demo; the API
behaviour around it is faithful.

---

## Tests

```bash
npm test          # vitest
npm run build     # tsc -b && vite build
```

`src/vision/__tests__/` covers the parts where being wrong is silent: the landmark and matrix pose
solvers, the angle bucketing, and the router's nearest / blend / coverage decisions. One of those
tests caught a real bug — the yaw was being read from the wrong element of the column-major
transformation matrix.

---

## Layout of the source

```
src/
  api/          transport, wire types, session rotation, demo backend
  vision/       MediaPipe landmarker, pose solvers, pose router
  store/        zustand store: one place for assets, state, jobs, streaming, routing
  components/
    layout/     shell, top bar, boot screen
    assets/     asset rail, thumbnails, drop target
    builder/    3D head canvas, multi-angle builder
    stage/      split compare, live pipeline
    inspector/  capabilities-driven controls
    jobs/       job list, steps, render
    system/     metrics
    activity/   log
```
