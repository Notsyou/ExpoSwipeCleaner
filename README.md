# Swipe Cleaner

Tinder-style cleanup for your camera roll. Swipe **left** to queue a photo or video for deletion, swipe **right** to keep it, then review the trash and delete everything in one go.

Built with [Expo](https://expo.dev) (SDK 58, React Native 0.88).

## Features

- **Photos & Videos modes:** toggle at the top. Videos autoplay muted, with tap-to-pause, a scrub bar and a mute button.
- **Trash review:** nothing is deleted until you open the review sheet and confirm. You can rescue items from there.
- **Undo:** step back through your last swipes.
- **Saved progress:** items you've already kept or trashed don't come back next time you open the app, and the trash queue survives restarts. Long-press the storage pill to start over.
- **Photo filters:** tap the filter pill at the top to choose:
  - **Show:** All, Camera, Screenshots, Downloads, Pictures (Android only), or Similar (burst-style shots taken within 3 seconds of each other)
  - **File type:** All, JPEG, PNG, HEIC/HEIF, or Other
  - **Albums:** any album with photos in it (WhatsApp, Instagram, …). On Android these are your folders.
  - **Files app folder (iOS, development build only):** pick a folder once, e.g. Downloads, and its images show up under Downloads.

  How the sources are detected:

  | | Android | iOS |
  |---|---|---|
  | Screenshots | `Screenshots/` folder or filename | built-in Screenshots album |
  | Camera | `DCIM/Camera/` or camera filenames | camera make/model in the photo's EXIF |
  | Downloads | `Download/` folder | photos without camera EXIF (saved from Safari/apps), plus the picked Files folder |

  Undo and the trash review keep working when you switch filters partway through.
- **Source labels:** chips at the bottom right of each photo show where it came from (screenshot / camera / download / pictures / other) and whether it has a duplicate.
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

| | Option A: your own PC, no account | Option B: home server, Expo account |
|---|---|---|
| **Git** | ✅ | ✅ |
| **Node.js 22.13+** and npm | ✅ | ❌ (bundled in the image) |
| **Docker + Docker Compose** (or Portainer) | ❌ | ✅ |
| **Expo Go** on your phone | ✅ | ✅ |
| Phone can reach the computer on port 8081 | ✅ same Wi-Fi | ✅ same Wi-Fi, or ZeroTier/Tailscale |
| **Expo account** | ❌ not needed | ✅ free account + access token |

Get Expo Go from the [App Store](https://apps.apple.com/app/expo-go/id982107779) or [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent).

---

## Option A: Run on your own PC (no account)

Best for development: fast reloads, and you can edit code directly. No Expo account is needed anywhere: not in the terminal, not in Expo Go.

**1. Install the requirements**

- Node.js **22.13 or newer** from [nodejs.org](https://nodejs.org) (check with `node -v`)
- Git

**2. Clone the repo and install dependencies**

```bash
git clone https://github.com/Notsyou/ExpoSwipeCleaner.git
cd ExpoSwipeCleaner
npm install
```

`npm install` also runs `patch-package`, which applies the fixes in `patches/`. Don't skip it: the app crashes in video mode without it.

**3. Make sure you're logged out of the Expo CLI**

```bash
npx expo whoami        # should say "Not logged in"
npx expo logout        # only if it shows a username
```

If the CLI is logged in but Expo Go isn't (or is logged in to a different account), the phone shows an error when opening the project. Either log both out, or log both in to the same account (that's Option B).

**4. Start Metro**

```bash
npx expo start
```

A QR code and an `exp://<your-pc-ip>:8081` address appear in the terminal.

**5. Open it on your phone** (same Wi-Fi as the PC)

- **iPhone:** scan the QR code with the Camera app.
- **Android:** scan it from inside Expo Go.
- **Or:** in Expo Go tap **Enter URL manually** and type the `exp://…:8081` address.

**6. If the phone is stuck on "Opening project…"**, your PC's firewall is blocking port 8081:

- **Linux (UFW):** `sudo ufw allow from 192.168.0.0/16 to any port 8081 proto tcp` (adjust to your LAN, e.g. `192.168.254.0/24`). Blocked attempts show in `journalctl -k | grep 'UFW BLOCK'`.
- **Windows:** click *Allow* when Windows asks about Node.js, or allow port 8081 in Windows Defender Firewall.
- **Any network, slower:** `npx expo start --tunnel`

**7. Grant photo access** when the app asks (on iPhone choose **Allow Full Access**, otherwise the app only sees the photos you picked), and start swiping.

After a code change, Metro reloads the app on its own. If it doesn't, shake the phone and tap **Reload**.

---

## Logged-out and offline mode

Everything works without an Expo account. Option A above is already logged out; this section sums up the rules and adds **offline mode** for when the PC has no internet.

### Logged out (no Expo account)

1. Log the CLI out, and keep it out:
   ```bash
   npx expo whoami     # should say "Not logged in"
   npx expo logout     # only if it shows a username
   ```
2. Make sure no token logs it back in. `EXPO_TOKEN` overrides `logout`:
   ```bash
   echo $EXPO_TOKEN    # should print nothing
   unset EXPO_TOKEN    # bash/zsh;  fish: set -e EXPO_TOKEN
   ```
   On the home server, leave `EXPO_TOKEN` empty in Portainer or `.env`.
3. **Sign Expo Go out too** (Expo Go → profile → Sign out). A logged-in Expo Go with a logged-out CLI shows an account error.
4. Start Metro and open the project by QR code or by typing `exp://<pc-ip>:8081` into **Enter URL manually**. Logged out, the project won't appear in Expo Go's list by itself.

### Offline (no internet on the PC)

`--offline` makes Metro skip every request to Expo's servers (version checks, account lookups, manifest signing) and serve an unsigned manifest instead. The phone still needs to reach the PC over Wi-Fi/LAN or ZeroTier/Tailscale; only the internet is optional.

```bash
npx expo start --offline
# with the home-server address:
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.254.140 npx expo start --offline
```

- Run `npm install` **once while online** first; after that, no downloads are needed.
- `--tunnel` and `eas update` need the internet, so they don't work offline.
- Expo Go itself doesn't need to be online, but it must already be installed and on the matching SDK.
- If you're **logged out**, add `--offline` anyway when the internet is flaky: it stops Metro from hanging on Expo's servers at startup.

---

## Option B: Run on the home server (Expo account)

Metro runs in Docker on the home server and stays up, so you and friends can open the app any time without your PC. Logging the server in to your Expo account means the project **shows up by itself in Expo Go** for anyone signed in to that account, so nobody has to type an address.

```
Home server (Docker, Metro :8081, logged in with EXPO_TOKEN)
        │  LAN 192.168.254.140  or  ZeroTier 10.156.88.161
        ▼
Phone with Expo Go, signed in to the same Expo account
```

**1. Create an Expo access token**

On [expo.dev](https://expo.dev): **Account settings → Access tokens → Create token**. Copy it; it's shown only once. Treat it like a password: never put it in a file that's committed to git.

**2. Decide which address phones will use**

Metro hands this address to the phone, so it must be one the **phone** can reach:

| Who connects | Address to use |
|---|---|
| Only phones on the home Wi-Fi | LAN IP, e.g. `192.168.254.140` |
| Friends / you on mobile data | ZeroTier IP `10.156.88.161` (each phone must join the ZeroTier network) |

**3. Deploy the stack**

*With Portainer (current setup):*

1. **Stacks → Add stack** (or open the existing stack) → **Repository**, URL `https://github.com/Notsyou/ExpoSwipeCleaner`, compose path `docker-compose.yml`.
2. Under **Environment variables** add:
   - `EXPO_TOKEN` = the token from step 1
   - `PACKAGER_HOSTNAME` = the address from step 2 (defaults to `10.156.88.161` if left out)
3. **Deploy the stack.** The first build takes a few minutes (`npm install` runs inside the image).

*With the command line on the server:*

```bash
git clone https://github.com/Notsyou/ExpoSwipeCleaner.git
cd ExpoSwipeCleaner
cat > .env <<'ENV'
EXPO_TOKEN=paste-your-token-here
PACKAGER_HOSTNAME=10.156.88.161
ENV
docker compose up -d --build
```

`.env` is in `.gitignore`, so the token stays on the server.

**4. Check it's running and logged in**

```bash
docker compose logs -f              # should end with "Logs for your project will appear below."
curl http://localhost:8081/status   # should print: packager-status:running
docker compose exec expo-swipe-cleaner npx expo whoami   # should print your Expo username
```

(With Portainer, the container is named something like `swipecleanerv2-expo-swipe-cleaner-1`; use its **Logs** and **Console** tabs for the same checks.)

**5. Open the server's firewall**

```bash
sudo ufw allow 8081/tcp
```

If phones connect over ZeroTier and the server runs a firewall, ZeroTier's own UDP ports must be open too (9993, plus the two ports shown by `zerotier-cli -j info` under `secondaryPort` / `tertiaryPort`).

**6. Connect from your phone**

1. In Expo Go, **sign in to the same Expo account** the token belongs to (Profile/Settings → Log in).
2. On the Home tab the project appears under **Development servers**. Tap it.
3. If it doesn't appear (it can take a minute after a restart), tap **Enter URL manually** and type `exp://<PACKAGER_HOSTNAME>:8081`, e.g. `exp://10.156.88.161:8081`.

Friends without your account can try step 3's manual URL. If Expo Go shows an account error for them, either sign that phone in to your account or redeploy without `EXPO_TOKEN` (the server then works like Option A: no account, manual URL only).

**Updating the server after a code change**

- **Portainer:** push to GitHub, then open the stack → **Pull and redeploy** with **re-pull / rebuild image** enabled. A plain restart keeps running the old code.
- **Command line:** `git pull && docker compose up -d --build`

`docker-compose.yml` uses `network_mode: host`, so Metro listens directly on the server's network interfaces. This only works on Linux; on Docker Desktop (Windows/macOS) use Option A.

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
| **Opens with an error about logging in / account** | The Expo CLI (or the server's `EXPO_TOKEN`) and Expo Go are on different accounts. Sign Expo Go in to the same account, or sign both out. Restart Metro after changing the CLI login. |
| **Old photos keep showing up / want to start fresh** | Long-press the storage pill → *Start over*. |
| **An album says "already reviewed" / "can't see the photos"** | Reviewed photos are hidden in every deck: long-press the storage pill to start over. "Can't see" means iOS access is set to Selected Photos: Settings → Privacy → Photos → **Full Access**. |
| **"Encountered two children with the same key"** or other swiper errors after updating | The swiper patch didn't apply. Run `npm install`, then restart Metro with `npx expo start -c`. |
| **Metro hangs at startup without internet** | Use `npx expo start --offline`. |

---

## Project structure

```
App.js                     main screen: decks, swiping, video player, trash flow
lib/progress.js            saved progress (AsyncStorage) and smart-deck filters
lib/sources.js             iOS screenshots album, EXIF camera check, albums, Files-app folder
components/
  ActionButtons.js         undo / review / empty-trash buttons
  MetadataPanel.js         size, resolution and date of the current item
  PhotoFilterSheet.js      filter sheet: decks, file types, albums, Files folder
  TrashReviewModal.js      review & rescue queued items
constants.js               layout sizes, paging limits, formatters
patches/                   patch-package fixes for third-party libraries
dockerfile                 Metro server image (Node 22)
docker-compose.yml         server deployment (EXPO_TOKEN, PACKAGER_HOSTNAME from env)
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
