# Building for Windows

## Option 1: Build on Windows Machine (Recommended)

The easiest way to build Windows installers is to build directly on a Windows machine.

### Prerequisites
- Windows 10 or later
- Node.js 18+ installed ([Download](https://nodejs.org/))
- Git (optional, for cloning)

### Steps

1. **Get the project files** (if not already on Windows):
   - Copy the entire project folder to your Windows machine
   - Or clone from Git if you have a repository

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the React app**:
   ```bash
   npm run build
   ```

4. **Create Windows installer**:
   ```bash
   npm run package
   ```

5. **Find the installer**:
   - Location: `release/PKM System Setup 2.0.0.exe`
   - Size: ~150-200 MB

The installer will be ready to share!

## Option 2: Cross-Compile from macOS (Advanced)

You can build Windows installers from macOS using Wine, but this is more complex.

### Prerequisites
- macOS with Homebrew
- Wine installed via Homebrew

### Steps

1. **Install Wine**:
   ```bash
   brew install --cask wine-stable
   ```

2. **Set up Wine** (first time only):
   ```bash
   winecfg
   ```
   - Set Windows version to Windows 10
   - Close the config window

3. **Build**:
   ```bash
   npm run build
   npm run package
   ```

**Note**: Cross-compilation can be unreliable. Building on Windows is recommended.

## Option 3: Use GitHub Actions (Automated)

If you push your code to GitHub, you can set up automated builds using the included `.github/workflows/build.yml` file.

### Steps

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Setup Windows builds"
   git push origin main
   ```

2. **Create a release tag**:
   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

3. **Download artifacts**:
   - Go to Actions tab in GitHub
   - Download the Windows build artifacts

## Current Configuration

The Windows build is already configured in `package.json`:

```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64", "ia32"]
    }
  ]
}
```

This creates:
- NSIS installer (`.exe` file)
- Supports both 64-bit and 32-bit Windows
- Includes desktop and Start Menu shortcuts

## Troubleshooting

### "electron-builder not found"
- Run: `npm install`

### Build fails with permission errors
- Run Command Prompt as Administrator
- Or use PowerShell with elevated permissions

### Antivirus flags the installer
- This is a false positive common with Electron apps
- Add an exception or use Windows Defender

### File size is very large
- This is normal (~150-200 MB)
- Electron apps include Chromium and Node.js runtime

## Sharing the Windows Installer

Once built, share:
1. `PKM System Setup 2.0.0.exe` (from `release/` folder)
2. `INSTALLATION_INSTRUCTIONS.md`

Your friend can:
1. Download the `.exe` file
2. Double-click to install
3. Follow the installation wizard
4. Launch from Start Menu or desktop shortcut

