# Swipe Cleaner

Tinder-style cleanup for your camera roll. Swipe **left** to queue a photo or video for deletion, swipe **right** to keep it, then review the trash and delete everything in one go.

Built with [Expo](https://expo.dev) (SDK 58, React Native 0.88).

## Features

- **Photos & Videos modes:** toggle at the top. Videos autoplay muted, with tap-to-pause, a scrub bar and a mute button.
- **Trash review:** nothing is deleted until you open the review sheet and confirm. You can rescue items from there.
- **Undo:** step back through your last swipes.
- **Saved progress:** items you've already kept or trashed don't come back next time you open the app, and the trash queue survives restarts. Long-press the storage pill to start over.
- **Smart decks (photos):** tap the deck pill to cycle through:
  - **All**: every photo, newest first
  - **Screenshots**: only screenshots
  - **Similar**: burst-style shots (same resolution, taken within 3 seconds of each other)
- **Metadata panel:** file size, resolution and date for the current item.

---

## How it works

This app runs in **development mode**: your phone runs the app shell, and the JavaScript code is served to it by a **Metro bundler** running on a computer (your PC or a server).

```
┌──────────────┐   JS bundle over HTTP :8081   ┌──────────────────────┐
│  Your phone  │ ◄──────────────────────────── │  Metro bundler       │
│  (Expo Go or │                               │  (your PC, or Docker │
│  a dev build)│                               │   on a home server)  │
└──────────────┘                               └──────────────────────┘
```

The phone must be able to reach the computer running Metro on **port 8081**. That means either:

- the **same Wi-Fi / LAN**, or
- a **VPN** such as [ZeroTier](https://www.zerotier.com) or [Tailscale](https://tailscale.com) when you're away from home (e.g. on mobile data).

> **Tip:** Your phone and Metro also have to be on the same Expo SDK. Expo Go from the app store only supports the latest SDK. If Expo Go says the project is incompatible, use a [development build](#option-c-development-build-full-features) instead.

---

## What you need

| | Run on your own PC | Run on a server (Docker) |
|---|---|---|
| **Git** | ✅ | ✅ |
| **Node.js 22.13+** and npm | ✅ | ❌ (bundled in the image) |
| **Docker + Docker Compose** | ❌ | ✅ |
| **Expo Go** app or a dev build on your phone | ✅ | ✅ |
| Phone and computer on the same network / VPN | ✅ | ✅ |
| Free Expo account (only for EAS builds & updates) | optional | optional |

Get Expo Go from the [App Store](https://apps.apple.com/app/expo-go/id982107779) or [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent).

---

## Option A: Run on your own PC

Best for development: fast reloads, and you can edit code directly.

**1. Install the requirements**

- Node.js **22.13 or newer** from [nodejs.org](https://nodejs.org) (check with `node -v`)
- Git

**2. Clone the repo**

```bash
git clone https://github.com/Notsyou/ExpoSwipeCleaner.git
cd ExpoSwipeCleaner
```

**3. Install dependencies**

```bash
npm install
```

This also runs `patch-package`, which applies the fixes in `patches/`. Don't skip it: the app crashes in video mode without it.

**4. Start Metro**

```bash
npx expo start
```

A QR code appears in the terminal.

**5. Open it on your phone**

- **iPhone:** scan the QR code with the Camera app.
- **Android:** scan it from inside Expo Go.

Your phone must be on the **same Wi-Fi** as your PC. If it can't connect:

- Allow Node.js / port **8081** through your PC's firewall (Windows asks the first time; click *Allow*).
- Or use a tunnel, which works across any network but is slower: `npx expo start --tunnel`

**6. Grant photo access** when the app asks, and start swiping.

---

## Option B: Run on a server with Docker

Best when you want Metro always running, for example on a home server that you and friends connect to.

**1. Install the requirements on the server**

- Docker and Docker Compose ([install guide](https://docs.docker.com/engine/install/))
- Git

**2. Clone the repo on the server**

```bash
git clone https://github.com/Notsyou/ExpoSwipeCleaner.git
cd ExpoSwipeCleaner
```

**3. Set the address phones will use to reach the server**

Open `dockerfile` and change this line to your server's IP:

```dockerfile
ENV REACT_NATIVE_PACKAGER_HOSTNAME=10.156.88.161
```

Metro puts this address into the bundle URL it hands to phones, so it must be an IP the **phone** can reach:

- Only using it at home? Use the server's LAN IP (e.g. `192.168.1.50`).
- Connecting from outside? Use the server's VPN IP (ZeroTier / Tailscale).

**4. Set your Expo token (optional)**

`EXPO_TOKEN` in `docker-compose.yml` is only needed for EAS commands (builds/updates) inside the container. Create one at expo.dev → *Account settings → Access tokens*, and keep it out of git: put it in a `.env` file next to `docker-compose.yml`

```env
EXPO_TOKEN=your-token-here
```

and reference it in `docker-compose.yml` as `- EXPO_TOKEN=${EXPO_TOKEN}`.

**5. Build and start**

```bash
docker compose up -d --build
```

The first build takes a few minutes (`npm install` runs inside the image).

**6. Check it's running**

```bash
docker compose logs -f                  # should end with "Logs for your project will appear below."
curl http://localhost:8081/status       # should print: packager-status:running
```

**7. Open the server's firewall**

Port **8081/tcp** must be reachable. With UFW:

```bash
sudo ufw allow 8081/tcp
```

If you use ZeroTier and the server runs a firewall, ZeroTier's own UDP ports must be open too (9993, plus the two random ports shown by `zerotier-cli -j info` under `secondaryPort` / `tertiaryPort`).

**8. Connect from your phone**

Open Expo Go, choose **Enter URL manually**, and type:

```
exp://<server-ip>:8081
```

using the same IP you set in step 3.

**Updating the server after a code change**

```bash
git pull
docker compose up -d --build
```

> **Portainer users:** when redeploying the stack, enable **re-pull / rebuild image**. A plain restart keeps running the old code.

`docker-compose.yml` uses `network_mode: host`, so Metro listens directly on the server's network interfaces. This is a Linux feature. On Docker Desktop (Windows/macOS), use Option A instead.

---

## Option C: Development build (full features)

Expo Go has limits. On Android it **can't get full media-library access**, so deleting and some metadata may not work properly. A development build is your own copy of the app with everything enabled. It still loads code from Metro (Option A or B).

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android   # or ios
```

Install the resulting build on your phone, then connect it to Metro exactly as in Option A or B.

| EAS profile | Use for | Update channel |
|---|---|---|
| `development` | day-to-day dev with Metro | `development` |
| `preview` | internal test APK for friends | `preview` |
| `production` | release build | `production` |

---

## Over-the-air updates (no server needed)

Installed `preview` / `production` builds can download JS updates directly from Expo, so friends don't need to reach your server or VPN at all.

**One-time setup:**

```bash
eas update:configure
```

This adds your project ID and update URL to `app.json`.

**Publishing an update:**

```bash
npm run update            # production channel
npm run update:preview    # preview channel
```

Apps pick the update up the next time they launch. Changing native code (new native packages, SDK upgrades) still needs a new build. Bump `version` in `app.json` when you do, because the runtime version follows it.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **"Could not connect to development server"** | The phone can't reach port 8081. Check it's on the same Wi-Fi/VPN. Check `REACT_NATIVE_PACKAGER_HOSTNAME` is an IP the phone can reach, and check the firewall. Test from another device: `curl http://<ip>:8081/status` |
| **"Request timed out"** | Usually the phone's connection. Check its signal / Wi-Fi first. The first bundle after a restart also takes a few seconds to build. |
| **"InteractionManager has been removed…" crash** | `patch-package` didn't run. Run `npm install` again (PC) or rebuild the image (server). |
| **"Node.js … is outdated" in the logs** | You're running an old image. Rebuild: `docker compose up -d --build` |
| **Metadata panel is empty / no file sizes** | Expo Go limitation on Android. Use a development build. |
| **Old photos keep showing up / want to start fresh** | Long-press the storage pill → *Start over*. |

---

## Project structure

```
App.js                     main screen: decks, swiping, video player, trash flow
lib/progress.js            saved progress (AsyncStorage) and smart-deck filters
components/
  ActionButtons.js         undo / review / empty-trash buttons
  MetadataPanel.js         size, resolution and date of the current item
  TrashReviewModal.js      review & rescue queued items
constants.js               layout sizes, paging limits, formatters
patches/                   patch-package fixes for third-party libraries
dockerfile                 Metro server image (Node 22)
docker-compose.yml         server deployment
eas.json                   EAS build profiles & update channels
```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start Metro (`expo start`) |
| `npm run android` / `npm run ios` | Start Metro and open on a connected device/emulator |
| `npm run lint` | Run ESLint |
| `npm run update` | Publish an OTA update to the production channel |
| `npm run update:preview` | Publish an OTA update to the preview channel |
