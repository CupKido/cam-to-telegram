# cam-to-telegram

Receive photos from a camera over FTP, auto-process them with ImageMagick, and send them to a selected Telegram user.

## What this project does

- Starts a Telegram bot (via Telegraf)
- Starts an FTP server on your local network for camera uploads
- Watches uploaded files, processes images with ImageMagick (`gm`)
- Sends processed photos to a selected Telegram user

## Requirements

- Node.js 18+ (recommended)
- npm
- ImageMagick (required by `gm` and this project’s processing flow)

## Installation

1. Clone the repository.
2. Install ImageMagick.
3. Install Node.js dependencies:

```bash
npm install
```

4. Create a `.env` file in the project root:

```env
TELEGRAM_TOKEN=your_telegram_bot_token
OWNER_TELEGRAM_ID=your_telegram_user_id
FTP_USERNAME=your_ftp_username
FTP_PASSWORD=your_ftp_password
```

5. The app will create `signed_in_users.txt` automatically on first run.

## Install ImageMagick

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y imagemagick
```

### macOS (Homebrew)

```bash
brew install imagemagick
```

### Windows

- Install from the official ImageMagick installer.
- Make sure ImageMagick is added to PATH.

Verify installation:

```bash
magick -version
```

## Run the app

```bash
node index.js
```

## Deploy with Docker

Build image:

```bash
docker build -t cam-to-telegram .
```

Run container:

```bash
docker run --rm \
  -e TELEGRAM_TOKEN=your_telegram_bot_token \
  -e OWNER_TELEGRAM_ID=your_telegram_user_id \
  -e FTP_USERNAME=your_ftp_username \
  -e FTP_PASSWORD=your_ftp_password \
  -p 2121:2121 \
  cam-to-telegram
```

If you want to persist `signed_in_users.txt` between container restarts, create the host file first (`touch signed_in_users.txt`) and mount it: `-v $(pwd)/signed_in_users.txt:/app/signed_in_users.txt`.
For production deployments, provide secrets through your platform's secret manager (or protected env files), and never bake credentials into the image.

## Configuration

### Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `TELEGRAM_TOKEN` | Yes | Telegram bot token from BotFather |
| `OWNER_TELEGRAM_ID` | Yes | Telegram user ID allowed to use `/selectUser` |
| `FTP_USERNAME` | Yes | FTP login username for the camera |
| `FTP_PASSWORD` | Yes | FTP login password for the camera |
| `FTP_PORT` | No | FTP server port (default: `2121`) |
| `HOST_IP_ADDRESS` | No | Public/LAN IP for passive mode (default: `0.0.0.0`) |
| `FTP_TLS_KEY` | No | Path to TLS private key file (PEM) — enables FTPS when set with `FTP_TLS_CERT` |
| `FTP_TLS_CERT` | No | Path to TLS certificate file (PEM) — enables FTPS when set with `FTP_TLS_KEY` |

When both `FTP_TLS_KEY` and `FTP_TLS_CERT` are provided, the FTP server starts in **FTPS** (implicit TLS) mode using the `ftps://` scheme. If either variable is absent, the server falls back to plain FTP.

#### Generating a self-signed certificate (for testing)

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/CN=cam-to-telegram"
```

Then set `FTP_TLS_KEY=./key.pem` and `FTP_TLS_CERT=./cert.pem` in your `.env` file.

### Network / ports

| Service | Port | Notes |
| --- | --- | --- |
| FTP server | `2121` | Plain FTP or FTPS (implicit TLS) depending on TLS configuration |
| Web status | `8080` | HTTP status page |

## Telegram commands

- `/start` — register/sign in user (or owner welcome flow)
- `/myID` — returns Telegram user ID
- `/selectUser` — owner-only command to select who receives photos
- `/selectUsers` — owner-only command to select multiple recipients
- `/selectPreset` — owner-only command to choose image editing preset (`Auto Exposure`, `Vivid`, `Black & White`, `Original (No Edit)`)

## Runtime folders

The app creates these directories automatically:

- `uploaded_photos/` — incoming camera files
- `processed_photos/` — processed output files

## How photo delivery works

1. Camera uploads image via FTP (`2121`)
2. File watcher detects completed upload
3. Image is processed with the currently selected ImageMagick (`gm`) preset
4. Processed image is sent to selected Telegram user
5. Original and processed files are deleted after a delay

## Notes

- This app is intended to run on a machine reachable by your camera over local network.
- If the bot fails to start, verify `.env` values and that ImageMagick is installed.
