# GameMotion 🎮

**Motion games you play with your whole body, using nothing but a webcam.**

Stand in front of your computer, see yourself on screen, and chop flying fruit with
your hands, dodge falling meteors, strike a pose, or dance until the light turns red. No controller, no headset, no
account. If you have a webcam, you have everything you need.

It is free, open source, and runs entirely on your own computer. Your camera picture
never leaves it, and the games work with the internet switched off.

## The games

| Game                | How you play                                                                           |
| ------------------- | -------------------------------------------------------------------------------------- |
| 🍉 **Fruit Chop**   | Fruit flies up around you. Swing your hands to chop it. Don't hit the bombs.           |
| 🎈 **Balloon Pop**  | Balloons drift up. Swipe through them before they get away.                            |
| ☄️ **Meteor Dodge** | You are the target. Step aside from meteors and duck under the lasers.                 |
| 🌉 **Human Bridge** | A wall is coming. Strike the pose to fit through. Two players join hands for a bridge. |
| 🪞 **Mirror Duel**  | A pose appears on a card. First to copy it scores.                                     |
| 🕺 **Freeze Dance** | Green light: dance as hard as you can. Red light: freeze, or lose a life.              |
| 🥊 **Punch Fly**    | Flies buzz in on the beat. Punch each one as it arrives.                               |
| 🔨 **Whack-a-Mole** | Whack each mole before it hides. Five levels, each faster. Don't hit the hedgehogs!    |
| 🎳 **Bowling**      | Stand where the ball should start, then swing an arm up to bowl. Ten frames.           |

Every game is played **over your own camera picture**, so you see yourself in the
middle of the action. One or two people can play, and the app keeps top scores for up
to four players. The last four are at their best with two: Human Bridge is a team game,
the others are a race against each other.

## Play right now, in your browser

**▶ [lean-learner.github.io/GameMotion](https://lean-learner.github.io/GameMotion/)**

Nothing to install. Open the link in Chrome or Edge on a computer with a webcam, click
**Play**, and allow the camera. Then stand 2 to 3 metres back and raise a hand.

It is the same game as the desktop app, and just as private: the page is loaded once,
then everything runs inside your browser. Your camera picture is never uploaded.

## Or install the desktop app

The desktop app works with no internet at all and opens straight into full screen,
which is nice for a TV or a party.

### 1. Download

Go to the **[latest release](https://github.com/lean-learner/gamemotion/releases/latest)**
and pick the file for your computer:

| Your computer                     | Download the file ending in |
| --------------------------------- | --------------------------- |
| Windows                           | `win-x64.exe`               |
| Mac with Apple chip (M1 or newer) | `mac-arm64.dmg`             |
| Mac with Intel chip               | `mac-x64.dmg`               |
| Linux                             | `linux-x86_64.AppImage`     |

### 2. Install and open

- **Windows:** double-click the file and follow the steps.
- **Mac:** open the file and drag GameMotion into Applications.
- **Linux:** make the file runnable (`chmod +x GameMotion-*.AppImage`), then run it.

Your computer will probably warn you the first time, because the app isn't signed by
a big company. That's expected:

- **Windows:** click _More info_, then _Run anyway_.
- **Mac:** right-click GameMotion, choose _Open_, then _Open_ again.

When asked, allow the camera. Stuck? **[INSTALL.md](INSTALL.md)** has more detail and
troubleshooting.

### 3. Play

1. Put the webcam at about chest height and **stand 2 to 3 metres back**, until your
   head and shoulders are in the picture.
2. **Raise a hand.** A cursor appears and follows it.
3. **Point at a game and close your hand into a fist.** Hold it for a moment: the tile
   fills up, then the game starts. Open your hand to cancel.
4. Have fun, and maybe move the coffee table first.

Handy keys: **Esc** goes back (and leaves full screen from the main menu), **F11**
toggles full screen. A mouse works in the menus too.

## Tips for a good time

- **Light the room.** Webcams struggle in the dark. Face a lamp or a window rather
  than standing with one behind you.
- **Give yourself space.** You'll be swinging your arms and stepping sideways.
- **Plain clothes help.** Sleeves that contrast with the background are easier to track.
- **Try Reach setup** in the main menu. It fits the cursor to your own arm length,
  which is great for kids.

## What it was built and tested on

GameMotion started as a hobby project, and this is the exact setup it grew up on:

- **Camera:** a Logitech C270, a basic 720p webcam. If it works on that, yours is
  probably fine.
- **Computer:** a desktop PC running Ubuntu Linux, with an ultrawide monitor.

The Windows and Mac versions are built automatically from the same code, but they have
had far less real-world testing. If something doesn't work on your machine, please
[open an issue](https://github.com/lean-learner/gamemotion/issues) and say what
happened. It genuinely helps.

## How it works (the short version)

```
 webcam  →  finds your body  →  understands the move  →  the game reacts
            and hands           "that was a chop!"
```

- **[Electron](https://www.electronjs.org)** turns it into a desktop app that runs on
  Windows, Mac and Linux. It's the same technology behind VS Code and Discord. The web
  version is the very same page, served by GitHub Pages instead.
- **[MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/guide)** is the clever
  part that spots your body and hands in the camera picture. It runs on your computer,
  not in the cloud.
- **[Phaser](https://phaser.io)** is the game engine that draws everything and keeps
  score.
- **TypeScript** is the language it's all written in.

Curious? **[STACK.md](STACK.md)** walks through every layer in plain language, with no
experience needed.

## Your privacy

- The camera picture is used on your computer and thrown away. It is never recorded,
  saved or sent anywhere.
- The desktop app blocks all internet traffic. It doesn't even check for updates. The
  web version downloads the game once and then talks to no one.
- The only things saved are player names, scores and settings: in one small file on
  your computer (desktop app) or in your browser's own storage (web version).

## Want to tinker with the code?

You'll need [Node.js](https://nodejs.org) 22 or newer and Git.

```bash
git clone https://github.com/lean-learner/gamemotion.git
cd gamemotion
npm install            # fetches the tools (a few minutes the first time)
npm run setup:models   # downloads the body-tracking models, once
npm start              # builds and opens the app
```

Other useful commands:

```bash
npm run dev         # run with instant reload while you edit
npm test            # run the automated tests
npm run build:web   # build the web version into out/web
npm run preview:web # ...and try it at the address it prints
```

Each game lives in its own folder under `src/renderer/src/games/`. Copying one is the
easiest way to start your own. More reading:

- **[STACK.md](STACK.md)**: how the app is put together, for beginners.
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**: the detailed technical notes.

Ideas, bug reports and new games are all welcome.

## License

GameMotion is free to use, change and share under the [MIT License](LICENSE).

It includes Electron and Phaser (MIT) and MediaPipe with its tracking models
(Apache 2.0).
