# How GameMotion is built: a beginner's guide to the stack

This page explains what GameMotion is made of, layer by layer: what each piece does,
why we picked it, and what it depends on. You don't need to know any of these tools
beforehand. To get it running, see the [README](README.md); for the full technical record, see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## The idea in one paragraph

GameMotion is a desktop program that watches you through a webcam, works out where
your body and hands are, and lets you play games by moving. Everything happens on your
own computer. No picture, score or setting is ever sent anywhere, and the app works
with the network cable unplugged.

## The layers at a glance

Think of the app as a stack of layers. Each one only talks to the layer next to it.

```
  You, moving in front of the webcam
        │
  1. Camera          the operating system hands us video frames
        │
  2. Tracking        MediaPipe finds body and hand points in each frame
        │
  3. Motion input    our code turns points into "cursor", "chop", "duck"
        │
  4. Games           Phaser draws the game and reacts to those motions
        │
  5. App shell       Electron puts it all in a window and guards the computer
        │
  6. Saved data      one small file with players, scores and settings
```

Around the stack sit the tools we use to write, check and package the code
(TypeScript, Vite, Vitest, ESLint, Prettier, electron-builder).

| Layer        | What we use                         | Where it lives                |
| ------------ | ----------------------------------- | ----------------------------- |
| Camera       | The web camera API (`getUserMedia`) | `src/renderer/src/camera/`    |
| Tracking     | MediaPipe Tasks Vision, in a worker | `src/renderer/src/tracking/`  |
| Motion input | Our own TypeScript                  | `src/renderer/src/input/`     |
| Games        | Phaser 4                            | `src/renderer/src/games/`     |
| App shell    | Electron                            | `src/main/`, `src/preload/`   |
| Saved data   | A JSON file                         | `src/main/store.ts`           |
| Language     | TypeScript                          | everywhere                    |
| Build        | Vite + electron-vite                | `electron.vite.config.ts`     |
| Packaging    | electron-builder                    | `electron-builder.yml`        |
| Checks       | Vitest, ESLint, Prettier            | `tests/`, `eslint.config.mjs` |
| Automation   | GitHub Actions                      | `.github/workflows/build.yml` |

## 1. Camera

**What it does.** Asks the operating system for the webcam and shows its video.

**What we use.** `navigator.mediaDevices.getUserMedia`, the same standard camera API
every web browser has. It is built into Electron, so there is nothing to install.

**Why.** It is the industry-standard way to reach a camera and it behaves the same on
Windows, macOS and Linux with any webcam the system recognises. We never talk to camera
hardware directly. We ask for video only, never the microphone.

**Good to know.**

- The camera is released the moment tracking stops, and the app copes with a camera
  being unplugged.
- On macOS the system shows its own "allow camera?" prompt the first time. On Windows
  the camera must be allowed in Privacy settings.
- One optional extra exists on Linux only: some webcams slow down in dim light, and the
  app can ask the system tool `v4l2-ctl` to hold them at 30 frames per second. It
  remembers the old value and puts it back on exit. If the tool isn't installed, the
  app simply carries on without it.

## 2. Tracking

**What it does.** Looks at each video frame and returns points: 33 for the body
(shoulders, elbows, hips, ...) and 21 for each hand.

**What we use.** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)
by Google (`@mediapipe/tasks-vision`), with its Pose Landmarker and Hand Landmarker
models.

**Why.** It is free, accurate enough for games, and runs entirely on your computer in
WebAssembly (a fast, safe format for running compiled code inside a web page), using
the graphics card when one is available. No account, no server.

**How we use it.**

- It runs in a **web worker**, a background thread. Finding a body in a picture takes a
  few milliseconds, and doing it in the background keeps the game drawing smoothly.
- We send one frame at a time and wait for the answer before sending the next, so work
  can never pile up.
- The model files and the WebAssembly runtime are copied into the app when it is built
  (`npm run setup:models`, `npm run assets`), which is why it works offline.

**Good to know.** The library tries to send anonymous usage statistics to Google and
has no off switch. GameMotion blocks that twice (see "How the app stays safe"), so
nothing leaves your computer.

## 3. Motion input

**What it does.** Turns raw points into things a game can use: a steady hand cursor
for menus, a chopping blade, "ducking", "is the player in view and at a good distance".

**What we use.** Our own code, no library. One well-known technique is included: the
"One Euro" filter, which removes camera jitter without making the cursor feel laggy.

**Why our own.** This is where the feel of the app is decided, and it is small. Keeping
it free of drawing code means every rule can be checked by automated tests with made-up
body positions, with no camera needed.

**Good to know.** Nothing ever selects instantly. Hovering a button starts a visible
timer, and closing your fist only makes the timer run faster. That rule lives in
`input/dwell.ts`.

## 4. Games

**What it does.** Draws the launcher and the games, and plays sounds.

**What we use.** [Phaser 4](https://phaser.io), a free, popular 2D game framework for
the web. It draws with WebGL, which uses the graphics card.

**Why.** It gives us sprites, text, tweens (smooth animations) and a game loop out of
the box, it is well documented, and it runs anywhere a browser does.

**How we use it, and the habits we follow.**

- **Rules are separate from drawing.** Each game has a `logic.ts` (scoring, timing,
  collisions; no Phaser at all) and a `...Scene.ts` (drawing only). The logic files are
  what the tests exercise.
- **Shared screens live in one place.** The newer games extend
  `games/CameraGameScene.ts`, which already has the menu, countdown, pause, score plates
  and score saving. A new game only writes its rules and what it draws.
- **Games load only when started.** Each game's `index.ts` uses a dynamic `import()`,
  so the launcher opens quickly.
- **Games get a small toolbox, not the whole app.** A game receives a `GameServices`
  object (`games/types.ts`): where the player's hands and body are, who is playing, how
  to save a score, how to exit. A game never touches the camera or tracking itself.
- **Games are played over your own camera picture.** The video sits behind a
  transparent game canvas, dimmed, and `games/cameraStage.ts` decorates whatever screen
  space is left around the 16:9 picture, so the same game fits a laptop, an ultrawide
  monitor or a TV.
- **No art or sound files.** Pictures are drawn by code and sounds are synthesised with
  the browser's Web Audio API (`games/sfx.ts`), so there are no assets to license.

Adding a game means adding a folder under `games/` with those three files and listing
it in `GAMES` in `src/renderer/src/main.ts`.

## 5. App shell

**What it does.** Turns a web page into a real desktop program with a window, an icon
and an installer, and decides what that page is allowed to do.

**What we use.** [Electron](https://www.electronjs.org), which bundles the Chromium
browser and the Node.js runtime. VS Code, Slack and Discord are built the same way.

**Why.** One codebase runs on Windows, macOS and Linux, and Chromium brings the camera
API, WebGL, WebAssembly and workers that the layers above need.

**The three parts of an Electron app.** This split is the most important thing to
understand about the codebase:

| Part         | Folder          | What it is                                                                                               |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| **Main**     | `src/main/`     | The trusted part. Creates the window, reads and writes files, applies the safety rules.                  |
| **Renderer** | `src/renderer/` | The web page: camera, tracking, games. Treated as untrusted and kept in a sandbox.                       |
| **Preload**  | `src/preload/`  | A tiny bridge between the two. It offers the page a short, fixed list of requests (`window.gameMotion`). |

When the page wants something only the trusted side can do, such as saving a score, it
sends a message through the bridge. The main part checks who is asking and that the
data makes sense before doing anything.

### How the app stays safe

These follow Electron's official
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security).

- **The page is sandboxed.** It cannot read files or run programs (`sandbox`,
  `contextIsolation` on; `nodeIntegration` off).
- **Camera only, for our page only.** The app grants the video camera to its own page
  and refuses everything else: microphone, location, notifications, screen capture.
- **Nothing leaves the computer.** Every network request that isn't to the app itself
  is cancelled, and a Content Security Policy (a list of what the page may load) says
  the same thing a second time.
- **The page can't wander off.** Opening new windows, embedding other pages and
  navigating to another site are all blocked.
- **Pages are served from `app://gamemotion`**, a private address that only maps to the
  app's own files, never from `file://`.
- **Every request across the bridge is checked**: it must come from our page, and its
  contents are validated. There is no general "run this" request.
- **Installed copies are locked down** with Electron "fuses" (`electron-builder.yml`),
  so the installed program can't be repurposed to run other code, and they have no
  developer tools.
- **Only one copy runs at a time**, because a webcam can only be opened by one program.

### The web version

The renderer is an ordinary web page, so it can also be served as a website with no
Electron at all. `npm run build:web` builds it into `out/web`, and GitHub Pages hosts it
for free. In a browser there is no preload bridge, so `src/renderer/src/platform/web.ts`
provides the same `window.gameMotion` list of requests using browser features: saved
data goes to the browser's storage, and desktop-only extras (start on login, the Linux
camera fix) are switched off. The rules for cleaning saved data live in
`src/shared/storeData.ts` and are shared by both versions. The web version opens on a
Play button because browsers only allow sound and full screen after a click.

## 6. Saved data

**What it does.** Remembers player names, top scores, each player's reach, the chosen
camera and the full-screen setting.

**What we use.** One JSON text file in your user folder, written by `src/main/store.ts`
(the web version keeps the same data in the browser's `localStorage`).

**Why not a database.** The data is tiny. A plain file needs no extra software, is easy
to back up or delete, and you can open it in a text editor. Everything read from it is
checked and cleaned first, so a damaged file can't break the app.

## The tools around the stack

**TypeScript** (language). JavaScript with types: you declare what shape your data has
and the compiler catches mistakes before the app runs. The whole project is TypeScript.

**Vite and electron-vite** (build). Browsers and Electron run JavaScript, so the
TypeScript has to be converted and bundled into a few files. Vite does that quickly;
electron-vite is a thin wrapper that does it for all three Electron parts at once and
gives instant reload while developing (`npm run dev`).

**electron-builder** (packaging). Turns the built app into things people can install: a
Windows installer and portable zip, a macOS disk image, a Linux AppImage and tar.gz.

**Vitest** (tests). Runs the automated checks in `tests/`: game rules, motion input,
saved data, and the safety-critical file lookup. Run them with `npm test`.

**ESLint and Prettier** (code quality). ESLint points out likely mistakes; Prettier
formats the code so it all looks the same. `npm run lint`, `npm run format`.

**GitHub Actions** (automation). On every push it runs the checks, builds the app on
Windows, macOS and Linux, and publishes the web version to GitHub Pages.

## What we depend on

The full list is in `package.json`. It is deliberately short.

| Package                      | Role                                      | Ends up in the app? |
| ---------------------------- | ----------------------------------------- | ------------------- |
| `electron`                   | The app shell (Chromium + Node.js)        | Yes                 |
| `phaser`                     | Game framework                            | Yes, bundled        |
| `@mediapipe/tasks-vision`    | Body and hand tracking                    | Yes, bundled        |
| `@electron-toolkit/utils`    | Small helpers for the main part           | Yes                 |
| `typescript`                 | Language and type checker                 | No, build only      |
| `vite`, `electron-vite`      | Build and development server              | No, build only      |
| `electron-builder`           | Makes the installers                      | No, build only      |
| `vitest`                     | Tests                                     | No, build only      |
| `eslint`, `prettier`         | Code checks and formatting                | No, build only      |
| `@electron-toolkit/*` config | Shared settings for TypeScript and ESLint | No, build only      |

Also needed on the computer that builds the app: **Node.js 22** and **npm**. People who
only play need nothing: the installer contains everything.

The tracking models (pose and hand `.task` files) are downloaded once by
`npm run setup:models` and are not stored in the repository because they are large.

## Following one movement through the stack

You swing your hand through a piece of fruit:

1. **Camera:** the webcam delivers a frame, about 30 times a second.
2. **Tracking:** the worker finds your hand's 21 points in that frame.
3. **Motion input:** the points become "right hand is here, moving this fast, in this
   direction", smoothed and predicted a few milliseconds ahead to hide camera delay.
4. **Game:** Fruit Chop's rules see the hand's path cross a fruit fast enough and score
   a chop; the scene draws the two halves and plays a sound.
5. **App shell:** when the round ends, the page asks the main part to save the score.
6. **Saved data:** the main part checks the request and writes it to the file.
