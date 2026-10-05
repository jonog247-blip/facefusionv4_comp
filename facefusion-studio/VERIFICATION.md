# Verification checklist

Run against a stock `v4-challenge` checkout:

```bash
python facefusion.py api --api-session-limit 8
cd facefusion-studio && npm run dev
```

The studio connects to `http://127.0.0.1:8000` by default. If the top bar shows `demo backend`,
the server is not reachable from the browser — check the port, or set the endpoint in the gear menu.

---

## 1 · Unmodified backend

| Step | Expectation |
| --- | --- |
| Start `python facefusion.py api` on the untouched branch | Server listens on `127.0.0.1:8000` |
| Open the studio | Top bar shows the real name and version, pill `live` |
| Open the inspector | 91 options across 23 groups, generated from `GET /capabilities` |
| Activity log | “Connected to …”, “Capabilities and state synchronised” |

No file outside this directory is touched: `git status` in the FaceFusion checkout must stay clean
apart from the untracked `facefusion-studio/` folder.

## 2 · Session lifecycle

| Step | Expectation |
| --- | --- |
| Watch the top bar clock | Counts down from 10:00, turns amber under 3 min |
| Leave it 12+ minutes | Clock restarts; no 401 in the activity log; inspector values survive |
| `curl -H "Authorization: Bearer <old>" http://127.0.0.1:8000/state` | `401` — old tokens are dead |
| Force expiry server-side | Client sees `426`, opens a new session, retries once, state re-syncs |

## 3 · Capabilities and state

| Step | Expectation |
| --- | --- |
| Toggle a processor chip | `PUT /state`, chip updates instantly, server value follows |
| Drag `face_detector_score` | Slider moves at pointer speed; the request is sent on release |
| Change execution providers | Provider buttons update; a `0.5 → 0.0` style reset returns to `default` |
| Type a value outside `choices` | Server answers `400`; the studio rolls the control back and logs the message |

## 4 · Assets

| Step | Expectation |
| --- | --- |
| Upload 3 – 5 face angles | Each becomes a source asset and a pin on the 3D head |
| Switch the target | `PUT /state?action=select&type=target`; the pose histogram resets |
| Select several sources | `PUT /state?action=select&type=source` with the full `asset_ids` list |
| Delete one asset | Row disappears; the angle it backed disappears with it |
| Download | `GET /assets/{id}?action=download` returns the file |

Note for MP4/MOV/M4A targets: the engine rejects files whose `moov` atom sits at the end. Remux
with `-movflags +faststart` first.

## 5 · Multi-angle builder

| Step | Expectation |
| --- | --- |
| Add a frontal photo | Pin near 0°, bucket `front`, badge not `manual` |
| Add a ¾ photo | Pin off-axis, bucket `quarter_*` |
| Pick a pin and drag the yaw slider | Pin follows; the asset routed to the engine changes |
| Start the camera sampler | Live yaw dial moves; the active pin is highlighted |
| Cover a profile the capture set lacks | Coverage drops, the missing bucket is listed |

If the model cannot load, the panel says so and the angles switch to `manual` instead of
fabricating a pose.

## 6 · Jobs

| Step | Expectation |
| --- | --- |
| Select source, target, processor → **Render** | `POST /jobs` → `POST /jobs/{id}?action=add` → `PATCH …submit` → `PATCH …run` |
| While it runs | Steps flip `queued → started → completed`, polled via `GET /jobs/{id}` |
| On completion | An `output` asset appears in the rail and in the compare view |
| Queue a second job | `409` is surfaced as a message, not a crash |
| Retry a failed job | `PATCH /jobs/{id}?action=retry`, the output asset is replaced |

## 7 · Streaming

| Step | Expectation |
| --- | --- |
| Select source + processors → **WebRTC stream** | SDP gathered, offer posted as `application/sdp`, `201` answer, frames render |
| Inspect the offer | No trickle: candidates are inside the SDP, no STUN/TURN servers listed |
| Start the sampler → **Image socket** | `WS /stream`; sent JPEGs come back processed, the compare view updates |
| Stop | `DELETE /stream`, tracks released, socket closed |

A session supports one WebRTC stream at a time; a second attempt returns `409`.

## 8 · Responsive

| Viewport | Expectation |
| --- | --- |
| 390 × 844 | Single column, bottom dock opens assets and inspector as drawers |
| 820 × 1180 | Same, wider drawers, no horizontal scroll |
| 1440 × 900 | Both rails pinned, stage flexes |
| 2560 × 1440 | `w-96` rails, jobs and metrics side by side |

## 9 · Offline review

| Step | Expectation |
| --- | --- |
| Stop the server, reload | Top bar flips to `demo backend`, reason in the tooltip |
| Upload, route, render, stream | All flows work; the composite frames are labelled as simulated |
| Restart the server, gear → Reconnect | Back to `live` within one probe |

## 10 · Automated

```bash
npm test        # 24 tests: pose solvers, bucketing, router decisions
npm run build   # tsc -b (strict) + vite build
```
