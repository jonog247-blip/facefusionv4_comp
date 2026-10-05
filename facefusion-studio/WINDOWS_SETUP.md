# Running FaceFusion Studio on Windows 11

Everything below assumes **PowerShell** (the `>` prompt). Commands work the same in cmd.exe;
swap `cd` and paths as needed.

---

## 0 · What you need

| | Version | Install (PowerShell, run once) |
| --- | --- | --- |
| Node.js | **22.12+ or 24 LTS** — mandatory, the build fails below this | `winget install OpenJS.NodeJS.LTS` |
| Git | any current | `winget install Git.Git` |
| FaceFusion v4 | *only if you want real processing* | see step 3 |

> **Important:** this repository's default branch is `master`, which has **no `api` command**.
> `python facefusion.py api` only exists on the v4 line. For the UI alone you do not need it.

Open a **new** terminal after installing Node, then check:

```powershell
node -v      # must print v22.12.0 or newer
npm -v
git --version
```

---

## 1 · Get the code

```powershell
cd $HOME
git clone -b arena/01a10c69-facefusionv4-comp https://github.com/jonog247-blip/facefusionv4_comp.git
cd facefusionv4_comp
```

Already have the repo? Then just:

```powershell
cd path\to\facefusionv4_comp
git checkout arena/01a10c69-facefusionv4-comp
```

---

## 2 · Install and run the UI

```powershell
cd facefusion-studio
npm install
npm run dev
```

Then open **http://localhost:5173**.

The top bar will read **`demo backend`** — that is correct and expected. No Python server is
running, so the studio falls back to its built-in demo, and everything is still clickable:
the inspector renders all 91 options, you can upload angles, and the routing/jobs/streams run
against simulated data. Use it to check the layout before you install the engine.

To stop: `Ctrl+C` in that terminal.

---

## 3 · (Optional) Run against a real FaceFusion v4 server

### 3a · Clone the v4 engine next to it

```powershell
cd $HOME
git clone -b v4-challenge https://github.com/facefusion/facefusion.git facefusion-v4
cd facefusion-v4
```

Keep it as a **separate folder** — never switch branches inside `facefusionv4_comp`, that
repository is the studio and must stay untouched.

### 3b · Prerequisites

```powershell
winget install Gyan.FFmpeg        # ffmpeg, required on PATH
# curl ships with Windows 11 already
```

Python via Miniconda (Anaconda works too):

```powershell
winget install Anaconda.Miniconda3
```

Open a **new** terminal, then:

```powershell
conda create -n facefusion python=3.12 -y
conda activate facefusion
cd path\to\facefusion-v4
python install.py
```

`install.py` downloads the Python dependencies and the ONNX runtimes for your GPU. First run
later downloads the model weights (several GB) into `.assets`.

### 3c · Start the API

```powershell
conda activate facefusion
cd path\to\facefusion-v4
python facefusion.py api --api-session-limit 8
```

It prints the host and port. Default is `http://127.0.0.1:8000`.

> If it says `invalid choice: 'api'` you are on the wrong branch — re-checkout `v4-challenge`.

### 3d · Point the studio at it

Nothing to do if the server is on port 8000 — the studio probes `GET /` on boot and switches
itself to `live`. The top bar then shows the real server name and version.

If you started the server on another port, either use the **gear icon in the top bar** (stored
in the browser, survives restarts), or create `facefusion-studio\.env.local`:

```powershell
" VITE_FF_API_BASE=http://127.0.0.1:9000 " | Out-File -Encoding utf8 .env.local
npm run dev
```

Keep **two terminals open**: one for the API, one for the studio.

---

## 4 · (Optional) Offline face landmarker

The 3D angle builder loads MediaPipe's model from a CDN. For a fully offline setup, drop the
file in once:

```powershell
cd path\to\facefusionv4_comp\facefusion-studio
mkdir -Force public\models
curl.exe -L -o public\models\face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

Without it the builder still works — angles fall back to manual yaw entry instead of guessing.

---

## 5 · Production build

```powershell
cd path\to\facefusionv4_comp\facefusion-studio
npm run build      # type-checks, then emits dist\
npm run preview    # http://localhost:4173
```

`dist\` is a plain static bundle — copy it to any web server. It needs to be served over HTTP
(not opened as a `file://` path) for the WebAssembly landmarker to load.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm` is not recognised | Node is not installed or the terminal is stale — close and reopen PowerShell |
| `EBADENGINE` warning | Node older than 22.12 → upgrade via winget |
| `npm : File ... cannot be loaded because running scripts is disabled` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Port 5173 is already in use` | `npm run dev -- --port 5174` |
| Top bar stuck on `demo backend` | The API is not reachable: is the server window still open? Wrong port? Try `curl.exe http://127.0.0.1:8000/` — it should print `{"name":…}` |
| Blank white page | Hard refresh `Ctrl+Shift+R`; check the dev-server terminal for the error |
| `python facefusion.py api` → `invalid choice: 'api'` | Wrong branch; the `api` command only exists on `v4-challenge` |
| Video upload rejected (400/415) | The engine needs the `moov` atom first: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4` |
| WebRTC stays on "Negotiating SDP…" | The client must reach the server directly — no proxy/VPN between browser and `127.0.0.1`, and allow the Node process through the firewall when prompted |
| Camera button does nothing | Grant camera permission; `localhost` counts as a secure origin, `http://192.168.x.x` does not |
| Slow first start | Expected — the first `npm install` downloads ~400 MB; the 3D head and landmarker are lazy-loaded afterwards |

---

## 6 · Verify the install

```powershell
cd path\to\facefusionv4_comp\facefusion-studio
npm test
```

24+ tests on the pose solvers and routing decisions, plus the demo-backend contract. If those
pass and the page loads at `http://localhost:5173`, the install is good.
