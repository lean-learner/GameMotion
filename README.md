# GameMotion — local motion games (Milestones 1–5)

A fully local Electron app for webcam motion games. Milestone 1 shows the webcam
(mirrored) with a live body skeleton and hand landmarks from MediaPipe, plus a
diagnostics overlay. Milestone 2 turns that tracking into game input: hand cursors,
swipes, crouch, lean, calibration and dwell selection. Milestone 3 adds the first
game, **Balloon Pop**, built with Phaser 4. Milestone 4 makes it a platform: a
gesture-driven launcher, player slots with saved high scores, settings, optional
start-on-login, and a packaged offline AppImage. Milestone 5 adds two-player mode
(Balloon Pop Versus) with split-view tracking. Since then: slicing feel for Balloon Pop,
per-player **Reach setup**, and a second game, **Meteor Dodge** (lean and crouch).
No cloud services: models and WASM ship with the app, and all non-local network
requests are blocked at runtime.

## Install (players)

Download the build for your system and follow **[INSTALL.md](INSTALL.md)**. Builds exist
for Windows (installer or portable zip), macOS (Intel and Apple Silicon) and Linux
(AppImage or tar.gz). Everything, including the tracking models, is inside, so it runs
offline on any computer.

## Platforms

Electron keeps GameMotion cross-platform; nearly all code is shared. Platform differences:

| Feature                           | Windows                         | macOS                                      | Linux                         |
| --------------------------------- | ------------------------------- | ------------------------------------------ | ----------------------------- |
| Tracking, games, launcher, scores | yes                             | yes                                        | yes                           |
| Camera permission                 | Windows privacy settings        | asked on first start (`askForMediaAccess`) | none needed                   |
| Start on login                    | Electron login item             | Electron login item                        | XDG autostart `.desktop` file |
| Hold 30 fps in low light          | not available (option disabled) | not available (option disabled)            | via `v4l2-ctl`, if installed  |
| Data folder                       | `%APPDATA%\gamemotion`          | `~/Library/Application Support/gamemotion` | `~/.config/gamemotion`        |

## Building releases (developers)

```bash
npm run release          # builds for this OS into release/<version>/ with SHA256SUMS.txt
                         # (on Linux: AppImage, tar.gz and the portable Windows zip)
npm run dist:win         # on Windows: installer + portable zip
npm run dist:mac         # on macOS: DMGs for Intel and Apple Silicon
npm run dist:linux       # on Linux: AppImage + tar.gz
npm run icons            # regenerate the app icon (scripts/make-icons.py, needs Pillow)
npm run install:desktop  # Linux: copy the AppImage to ~/Applications, add app-menu entry + desktop icon
npm run uninstall:desktop
```

**GitHub Actions** (`.github/workflows/build.yml`) tests and packages natively on
Windows, macOS and Linux for every push. Pushing a tag such as `v0.2.0` publishes a
GitHub release with every build, checksums and INSTALL.md. Builds aren't code-signed
yet, so first launches show the usual Windows SmartScreen / macOS Gatekeeper warning;
INSTALL.md explains how to proceed.

Building the Windows _installer_ from Linux needs Wine, but the portable Windows zip
doesn't (its `.exe` just lacks an embedded icon). Mac disk images can only be built
on macOS (or in CI).

## Setup for development (once, needs internet)

```bash
npm install            # dependencies + Electron binary
npm run setup:models   # downloads 3 MediaPipe .task models (~23 MB) into src/renderer/public/mediapipe/models
```

After this the app works fully offline.

## Run

```bash
npm run dev     # development (hot reload); F12 = DevTools
npm start       # production build, then run it
npm run build   # assets + typecheck + production bundle in out/
npm run release       # packaged builds for this OS (see "Building releases")
```

In the app: pick a camera, then **Start tracking** / **Stop tracking**. F11 toggles
fullscreen. Stop releases the camera. Models stay loaded, so restarting is fast.

Settings in the toolbar:

| Setting                  | Options                                      | Notes                                                                      |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| Pose model               | Full (default), Lite, Heavy                  | Lite is fastest; Heavy is most accurate (+4 ms)                            |
| Execution                | Auto (GPU, CPU fallback), GPU only, CPU only | The overlay shows which one is really in use and why GPU failed, if it did |
| Max rate                 | Every frame (default), 30 Hz cap, 15 Hz cap  | A cap lowers GPU load                                                      |
| Hold 30 fps in low light | on (default), off                            | Game-only camera tuning; see below                                         |
| Auto-brighten display    | on (default), off                            | Brightens the displayed video on the GPU; tracking uses the raw frames     |

### Low-light frame rate (camera tuning)

Many webcams, the Logitech C270 included, lengthen their exposure in indoor light
and drop from 30 to about 15–20 fps. With **Hold 30 fps in low light** on, GameMotion
sets the camera's `exposure_dynamic_framerate` control to 0 _only while tracking_.
The camera then stays at 30 fps and uses gain instead, so the picture gets darker.
**Auto-brighten** compensates on the GPU with a CSS `brightness()` filter on the video,
driven by the frame's average brightness, which the tracking worker samples every 10th frame.

The change is game-only:

- The previous value is saved before anything is changed. It is restored when tracking
  stops, the camera disconnects, the window reloads or crashes, or the app quits
  (including SIGINT/SIGTERM).
- If the app is killed outright, a recovery file in `~/.config/gamemotion` restores the
  value on the next launch.
- If the value was already 0, nothing is changed.

Requires Linux with `v4l-utils` installed (`v4l2-ctl`). Without it, or for cameras it
can't identify, the diagnostics show _not applied_ and the camera is left untouched.
The page cannot choose device paths or commands: it sends only the camera label over
two IPC calls, and the main process maps that label to `/dev/videoN` via sysfs.

## Verification

```bash
npm run typecheck
npm run lint
npm test                # unit tests (vitest)
npm run selftest -- --fake --seconds 25                           # synthetic camera
npm run selftest -- --fake-file clip.y4m --params "delegate=CPU"  # recorded clip as camera
npm run selftest -- --seconds 25                                  # REAL webcam
```

`selftest` launches the built app, starts tracking automatically and collects the
`[metrics]` log lines, then prints a summary. It exits non-zero if tracking produced
no results. Options: `--shot out.png` saves one screenshot; `--params` presets
the UI (`delegate=GPU|CPU|auto`, `pose=full|lite`, `hz=0|15|30`, `cycle=1` to exercise
stop then restart). A test clip can be made from any image or video with:
`ffmpeg -loop 1 -i in.jpg -t 6 -r 30 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p" clip.y4m`
(for a video, drop `-loop 1`).

### Manual hardware checks (need a person in front of the webcam)

1. `npm start`, click **Start tracking**, and allow camera access if asked.
2. The diagnostics should show camera `1280x720 @ 30 fps`, Camera FPS ≈ 30, Execution `GPU`.
3. Step back until your whole body is visible. The skeleton should follow your arms and legs.
4. **Handedness:** raise only your _right_ hand. Its label should read **Right hand**
   (confirmed on 2026-11-09).

5. Move quickly. The overlay should stay on your limbs, and Latency should stay well under 50 ms.
6. Click **Stop tracking**. Your webcam's activity LED should turn off.
   Start again: tracking should resume without reloading models.
7. Unplug the webcam while tracking. You should see "The camera was disconnected." and no crash.
8. Start while another app holds the camera. You should see "...may be in use by another application."
9. Switch Execution to _CPU only_ and confirm it still tracks, at a lower rate.
10. Disconnect from the network, restart the app, and repeat step 3 (the offline check).

## Architecture

```
src/main/            Electron main process
  index.ts           window, app:// protocol, permissions, network guard
  appProtocol.ts     safe URL → file mapping for app://gamemotion
  selfTest.ts        opt-in env-driven smoke test (inactive by default)
  cameraTuning.ts    game-only webcam frame-rate hold (v4l2-ctl), with restore and crash recovery
src/preload/         version strings + two camera-tuning calls
src/renderer/
  index.html, assets/main.css
  src/main.ts                    UI wiring, diagnostics, metrics logging
  src/camera/CameraService.ts    getUserMedia, settings, error mapping, release
  src/tracking/types.ts          standardised TrackingFrame (the boundary that games consume)
  src/tracking/TrackingService.ts  owns the worker, frame pump, stats
  src/tracking/frameScheduler.ts   frame-drop and rate-cap policy
  src/tracking/tracking.worker.ts  MediaPipe Pose and Hand Landmarker (module Web Worker)
  src/overlay/OverlayRenderer.ts   draws skeleton, hands and palm markers (mirrored)
  src/overlay/InputOverlay.ts      Motion input test layer (cursors, dwell buttons, meters)
  src/input/                       Motion Input layer (Milestone 2): games use only this
    MotionInput.ts   entry point: update(frame) -> snapshot + events; predictCursor()
    types.ts         public API types (player space, events)
    body.ts          per-frame body measurements in mirrored, aspect-corrected space
    calibration.ts   automatic hold-still calibration, recalibrates on distance change
    cursor.ts        reach-zone mapping, One-Euro smoothing, prediction
    posture.ts       crouch (shoulder drop) and lean (shoulder tilt + hip offset)
    swipe.ts         per-hand swipe detection
    dwell.ts         hover-to-press selection for menus
    oneEuro.ts       One-Euro filter
  public/mediapipe/              generated: WASM (copied from node_modules) and models (downloaded)
scripts/              models manifest, download, asset copy, selftest runner
tests/                vitest unit tests
```

### Decisions

- **Inference runs in a module Web Worker.** Each camera frame is grabbed with
  `requestVideoFrameCallback` and `createImageBitmap`, then _transferred_ (zero-copy) to the
  worker. Pose and Hand landmarkers each run once per frame (`detectForVideo`,
  `runningMode: "VIDEO"`). The UI thread only draws.
- **No stale frames.** Only one frame is in flight at a time. Frames that arrive while the
  worker is busy are skipped and counted ("busy" in the overlay). Latency therefore stays
  bounded even when inference is slower than the camera (e.g. on CPU).
- **Rendering and tracking rates are separate.** The video plays at camera rate in the
  compositor; the overlay redraws only when a tracking result arrives.
- **The rate cap is a token bucket.** Frame callbacks snap to the display refresh, so frame
  spacing jitters. A fixed minimum interval was measured dropping a 30 fps camera to
  about 23 fps; the token bucket caps only the average rate.
- **GPU with visible CPU fallback.** In _Auto_ mode, if the GPU delegate fails to
  initialise the worker retries on CPU and reports the reason in the overlay. Results are
  never faked or hidden.
- **Coordinates.** `TrackingFrame` uses _unmirrored_, normalised image coordinates.
  Mirroring is a display concern handled by the renderer. Milestone 2's input layer
  decides which space games receive.
- **Custom `app://gamemotion` protocol instead of `file://`.** It gives the page a secure origin,
  which module workers, `fetch` of local models and WASM streaming need. Paths are confined
  to the renderer directory (unit-tested against encoded traversal), and the protocol
  sends a strict CSP.
- **Security.** `contextIsolation` on, `nodeIntegration` off, `sandbox` on. Only our own
  origin may use the camera (video only; microphone and all other permissions are denied),
  popups and navigation away from the app are blocked. The preload exposes only two
  camera-tuning calls. Their handlers check the caller's origin, accept only a camera
  label, and run `v4l2-ctl` without a shell, with fixed arguments.
- **Offline guarantee.** `@mediapipe/tasks-vision` 1.2.2 includes usage telemetry that posts
  to `odml.pa.googleapis.com` and has no public opt-out. It is blocked twice: by CSP
  `connect-src 'self'` and by a main-process `webRequest` guard that cancels every request
  not to the app's own origin (this also covers dev mode). Verified in both modes.
- **Explicit profile directory.** User data lives in `~/.config/gamemotion`, so the app never
  shares Chromium state with another Electron app.
- **Phaser 3** is installed (`phaser@3.90`, as specified; the latest release is 4.x) but not
  used until Milestone 3.

## Measured performance

Measured with `npm run selftest` on Ryzen 5 5600, RTX 5070 (driver 595.99), Ubuntu 26.04
(Wayland), Electron 45.2.3 / Chromium 156. The input was a 1280×720, 30 fps fake-camera
clip. These figures are **not** from the real webcam, which was in use by another process
during testing. Steady state, warm-up excluded:

| Config                             | Tracking FPS | Pose   | Hands  | Frame→result latency |
| ---------------------------------- | ------------ | ------ | ------ | -------------------- |
| GPU, Full pose, body only in frame | 30.0         | 6.7 ms | 3.4 ms | 15 ms (max 23)       |
| GPU, Full pose, body + 2 hands     | 30.0         | 6.7 ms | 6.5 ms | 17 ms (max 25)       |
| CPU, Full pose, body + 2 hands     | 9.8          | 29 ms  | 40 ms  | 70 ms (max 79)       |

The GPU path runs at the camera's full 30 fps with about 3× headroom. Model load
takes about 0.3 s.

**Real webcam (Logitech C270, live person, GPU, 2026-11-09):** pose plus hands about
6.9 ms, latency about 16 ms. Tracking matched every camera frame, but the camera itself
delivered only **20 fps** (see limitations). Body skeleton, hand labels and
stop/restart (webcam LED off) were confirmed by hand.

## Known limitations

- **The C270's field of view is narrow (fixed lens, no zoom control).** Below the waist is
  often out of frame. Tested 2026-11-09: a 4:3 mode (960×720) shows no more of the body than
  1280×720, so the 720p mode is not cropped. Mitigations: stand about 2.5–3 m back, or
  place the camera at chest height tilted slightly down. Milestone 2 designs calibration and
  gestures around the upper body. The **Body in view** diagnostic shows how much the
  camera currently sees. Last resort: a wider-angle webcam (about 90°).

- **Low-light 30 fps hold verified on the real C270 (2026-11-09).** Camera FPS rose from 20
  to 30, body and both hands tracked well, and the setting was restored (0 back to 1) when
  tracking stopped.
- At 30 fps the C270 picture is noticeably dim. Its auto-exposure doesn't adjust gain,
  which stays at 32/255. This is accepted for now because games won't show the camera
  feed and tracking was unaffected. If tracking degrades in darker rooms, add game-only
  automatic gain: adjust the `gain` control from the measured brightness, with the same
  save/restore rules as the frame-rate hold.
- In very dark scenes tracking degrades (a test clip at 14/255 brightness lost one of two
  hands). Display brightening does not help tracking. Brightening the frames sent to
  the models is possible but costs an extra GPU pass; do it only if the real camera needs it.
- Manual checks 7–10 (unplug, camera busy, CPU mode with a live person, offline) have not
  been run by hand. CPU mode and the permission-denied error were covered by automated
  tests on test clips. The camera-busy and unplug paths are coded but untested.
- MediaPipe logs a harmless `NORM_RECT without IMAGE_DIMENSIONS` warning for
  non-square frames, and Chromium logs a harmless Wayland/Vulkan warning. WebGL2 works.
- The camera choice is not remembered between launches.
- One player only (`numPoses: 1`).

## Milestone 2: Motion input

Games use `MotionInput` and the types in `src/input/types.ts`, never MediaPipe:

```ts
const input = new MotionInput(cameraWidth / cameraHeight)
onTrackingFrame((frame) => {
  const snap = input.update(frame) // calibration, cursors, lean, crouching, events
  for (const e of snap.events) handle(e) // swipe / crouch / lean / calibrated
})
requestAnimationFrame((now) => draw(input.predictCursor('right', now))) // display-rate cursor
```

All positions are in **player space**: mirrored like a mirror, so "right" is the
player's own right and appears on the right of the screen. Cursors are 0..1 game-screen
coordinates. Thresholds are measured in **shoulder widths**, so behaviour doesn't change
with distance from the camera.

| Input        | How it works                                                                                                                                                                                                                                                                         | Needs                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Calibration  | Automatic: hold still for 1.5 s with shoulders visible. Redone automatically if you step much closer or further away (more than ±30 % for 1 s), or on demand.                                                                                                                        | Shoulders                                                   |
| Hand cursors | Each hand has a comfortable reach zone around its shoulder (head height to waist, slightly across the body to arm's length), mapped onto the whole screen. One-Euro smoothing; drawn at display rate with up to 60 ms of prediction to hide latency. A hanging arm hides its cursor. | Shoulders + hand (palm from hand tracking, else pose wrist) |
| Swipe        | 0.9+ shoulder widths in under 350 ms at 2.5+ widths/s along one axis. Tracked only while the wrist is above lower-chest height, so raising a hand never fires a swipe up. One-frame tracking jumps are ignored; 500 ms cooldown per hand.                                            | Shoulders + pose wrist                                      |
| Crouch       | Shoulders 0.45 widths below their calibrated height (ends below 0.25).                                                                                                                                                                                                               | Calibration; no legs needed                                 |
| Lean         | Shoulder-line tilt (full at 20°), averaged with shoulders-over-hips offset when the hips are visible. Starts at 0.5, ends below 0.3.                                                                                                                                                 | Shoulders                                                   |
| Dwell select | A cursor resting on a target for 1 s selects it once; leave and return to select again.                                                                                                                                                                                              | Cursors                                                     |

Punches are not implemented: they need reliable depth and no game needs them yet.

### Testing motion input

- **Unit tests** (`npm test`): scripted synthetic bodies exercise calibration (still,
  moving, distance change, drop-outs), crouch (also with hips out of frame), lean (also
  from tilt only), swipes (four directions, slow pointing, diagonals, arm raises, tracking
  jumps), cursor mapping and prediction, and dwell selection.
- **End to end:** the self-test on a clip shifted down for 2 s reports calibrated, crouch,
  stand up.
- **Live:** leave **Motion input test layer** on. It shows the calibration prompt, both
  cursors, a **Recalibrate** and a **Test button** (dwell 1 s to press), lean and crouch
  meters, and a log of recent gestures. The diagnostics panel adds Calibration and Posture.

## Milestone 3: Balloon Pop

Click **Play Balloon Pop** (Esc returns). The game fills the window; the camera shrinks
to a corner preview so players can check their framing.

- **Play:** a 60-second round. Balloons rise from the bottom, more and faster as the round
  goes on. **Swipe** through them with either hand cursor: a hand must be moving at least
  400 px/s (about a third of the screen per second, measured over 120 ms) to pop. A resting
  or slowly drifting hand only makes a balloon wobble. The cursor glows while the hand is
  fast enough. Normal balloons score 10 and golden ones 50.
  Quick consecutive pops build a combo multiplier (×2 after 3, up to ×4); a balloon that
  escapes resets it.
- **Controls, all by gesture:** dwell buttons for Start, Resume, Restart, Menu, Play again
  and Quit. A long-dwell (1.5 s) pause button sits top right. The game **pauses itself**
  when the player leaves the frame for 1 s, then resumes with a countdown.
- **Hits** test the hand's whole path since the last frame (segment vs circle), so a fast
  swipe through a balloon pops it. A hand that disappears and reappears elsewhere does not.
- **Structure:** the rules (`games/balloonPop/logic.ts`) are plain TypeScript with unit
  tests. `BalloonPopScene.ts` only draws (generated textures, particles, tweens).
  Sounds are synthesised with Web Audio (`games/sfx.ts`), so there are no asset files.
  Phaser loads only when a game starts.
- **Platform API:** games implement `GameModule` and receive `GameServices` (cursors at
  display rate, motion snapshot, gesture events, exit) — `src/renderer/src/games/types.ts`.

### Stack changes

- **Phaser 4.2** instead of Phaser 3. Phaser 3.90 (May 2025) has had no release since;
  Phaser 4 has been stable since April 2026. Switched before any game code existed.
- **Heavy pose model** available. On the RTX 5070 it costs about 4 ms more per frame
  (11–13 ms vs 7–8 ms) and still runs at 30 fps. Full remains the default until the guided
  test shows Heavy is better in practice.
- **GPU warm-up:** the tracking worker runs one inference on a blank image while loading,
  so shader compilation (about 2 s) happens behind the loading message. Worst-case
  first-frame latency dropped from about 2,500 ms to about 25 ms.
- **Renderer minified:** Phaser shrinks from 7 MB to 1.4 MB.

## Milestone 4: Platform

**Start-up:** `npm start` (or the AppImage) opens straight into the **launcher** and starts
tracking. Everything in the launcher works by hand cursor (hold 1 s) or mouse click:

- **Who is playing?** Four colour-coded player slots. The selected one is highlighted
  and remembered.
- **Games:** one tile per game with its best score, plus a top-5 table. Balloon Pop
  saves each finished round for the current player and shows "New personal best!" and
  the top scores at game over.
- **Settings** opens the desktop view (diagnostics, test tools, settings strip).
  **Exit** needs a 2-second hold.
- **Esc** steps back: game → launcher → settings view. **F11** toggles fullscreen.

**Settings view** (the old diagnostics page) adds a strip with player names (typed at
the PC), **Start fullscreen** and **Start on login**. Start on login is off by default.
It writes `~/.config/autostart/gamemotion.desktop` only while switched on, pointing at
the AppImage when run from one.

**Data:** `~/.config/gamemotion/gamemotion-data.json` holds slots, the top 10 scores per
game and settings. Writes are atomic (temp file + rename). An unreadable file is moved
aside as `.corrupt-<time>` rather than lost. Every value from the page is validated in the
main process (slot ids, names stripped of control characters and capped at 20 characters,
integer scores, game ids `[a-z0-9-]`). Self-test runs use `~/.config/gamemotion-selftest`,
so automated tests never touch real scores.

**Packaging:** see "Building releases" above. Each build (about 170–205 MB, mostly
Electron) contains the app, all models and the WASM runtime, so it runs fully offline.
Phaser and MediaPipe are build-time dependencies: they're bundled into the app's code,
so their source isn't shipped as well.

## Milestone 5: Multiplayer

Choose **2 players** in the launcher, then pick a **Left player** and a **Right player**.
**Balloon Pop Versus:** both players share the sky, each with their own score, coloured
cursors and combo. The game ends with "<name> wins!" or "It's a draw!", and both scores go
to a separate versus table (`balloon-pop-2p`). The game pauses if either player leaves
the frame.

- **Split-view tracking.** MediaPipe's person detector shrinks the whole frame to about
  224 px, so two people standing far enough back to share the C270's narrow view become
  too small to find. Measured on test clips: whole-frame detection found **1 of 6** people;
  tracking each half of the frame separately found **6 of 6**. In 2-player mode the left
  and right halves (overlapping by 10 %) each get their own pose and hand models. Landmarks
  are mapped back to full-frame coordinates, and a person or hand seen in the overlap is
  kept once (`tracking/splitView.ts`). Cost on the RTX 5070: pose about 15 ms + hands about
  8–12 ms per frame, 28–30 fps, about 23–28 ms latency.
- **Stable players** (`input/players.ts`). Bodies are matched to players by shoulder
  position, scaled by body size, using the best overall pairing, so MediaPipe's
  reporting order doesn't matter and players keep their number while moving. Newcomers
  take a slot by side (left person = player 1). A player missing for 1.5 s frees their
  slot. Each hand goes to the person whose wrist is nearest.
- **Per-player input.** Each player has their own `MotionInput` (calibration, cursors,
  gestures). Games get `services.players()` and pass a player index to
  `input.cursors(now, player)` / `snapshot(player)`. Gesture events carry the player number.
- **Rule for players:** stand side by side, each in your half, further back than in
  single-player mode. The launcher hint shows "1 of 2 players in view" until both are
  found.
- **Lean events are debounced** (a direction must hold 100 ms), so a body jittering near
  the threshold can't fire a stream of events. The continuous lean value isn't delayed.

## After the milestones

### Balloon Pop: slicing feel

- **Blade trails:** each hand leaves a glowing, tapering trail (170 ms), drawn at display
  rate. It's bright while the hand is fast enough to slice.
- **Split halves:** a popped balloon splits along the swipe direction, and the halves fly
  apart and fall.
- **Multi-slice bonus:** popping 3 or more balloons in one continuous stroke adds 10 points
  per balloon ("3x slice!"). A stroke starts when the hand gets fast enough (swoosh sound)
  and ends when it slows down.

### Reach setup (per player)

Launcher → **Reach setup**. Each player traces big circles with the right hand, then the
left (8 s each; in 2-player mode both players at once). The area their hands covered
(95th percentile, shrunk 10 % for comfort, clamped to sane limits) becomes their cursor
reach zone. It's saved per player slot and used whenever that player plays
(`input/reach.ts`, `games/reachSetup/`).

### Meteor Dodge (second game)

**Lean** left or right to move your avatar; **crouch** to duck under laser beams (a
flashing warning stripe shows where they'll sweep, 1 s ahead). Dodge falling meteors,
catch stars (+50), 3 lives. Points accrue for every second survived, and it speeds up
over 90 s. Uses the upper-body crouch and lean detectors, so it works with the C270's
narrow view. The avatar follows you on the menu, so you can try the controls first.
Versus: two avatars in player colours; the higher score wins. Scores go to
`meteor-dodge` / `meteor-dodge-2p`. Hands are only used for menus and the pause button.

### Auto-pause fix

Auto-pause now needs positive evidence (tracking says the shoulders aren't visible). Old
data no longer counts as the player leaving: a roughly 1-second stall on the first run
after a fresh build was intermittently pausing games.

## Next milestone

All five planned milestones are built, plus the extras above. Still needed with real
players: swipe speed (`MIN_POP_SPEED`), Meteor Dodge difficulty, Versus framing with
two people on the C270, and Full vs Heavy pose models.
