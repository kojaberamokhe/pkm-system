# Installation Instructions for PKM System

## Quick Start

### Windows

1. Download `PKM System Setup x.x.x.exe`
2. Double-click the installer
3. Follow the installation wizard
4. Launch PKM System from the Start Menu or desktop shortcut

### macOS

1. Download `PKM System-x.x.x.dmg`
2. Double-click the DMG file to open it
3. Drag "PKM System" to your Applications folder
4. Open Applications and double-click "PKM System"
   - **First time**: You may see a security warning. Right-click the app and select "Open", then click "Open" in the dialog
5. The app will launch and you can start using it!

### Linux

**Option 1: AppImage (Recommended - Portable)**

1. Download `PKM System-x.x.x.AppImage`
2. Make it executable:
   ```bash
   chmod +x PKM\ System-x.x.x.AppImage
   ```
3. Double-click to run, or run from terminal:
   ```bash
   ./PKM\ System-x.x.x.AppImage
   ```

**Option 2: Debian/Ubuntu Package**

1. Download `PKM System-x.x.x.deb`
2. Install using:
   ```bash
   sudo dpkg -i PKM\ System-x.x.x.deb
   ```
3. Launch from your applications menu

## System Requirements

- **Windows**: Windows 10 or later (64-bit)
- **macOS**: macOS 10.15 (Catalina) or later
- **Linux**: Most modern distributions (Ubuntu 18.04+, Debian 10+, Fedora 30+, etc.)

## First Launch

When you first launch PKM System:

1. The application will create a local database to store your notes and flashcards
2. You can start creating notes immediately
3. All data is stored locally on your computer - nothing is sent to the internet

## Features Overview

- **Notes**: Create and organize notes in a hierarchical folder structure
- **Flashcards**: Create flashcard notes with spaced repetition (FSRS v6 algorithm)
- **Review**: Review flashcards with intelligent scheduling
- **Knowledge Tree**: Visual tree structure for organizing your knowledge
- **Markdown Support**: Full markdown formatting support
- **Media**: Add images and audio to your notes and flashcards
- **Forvo Integration**: Fetch pronunciations for language learning flashcards

## Data Storage

Your data is stored locally on your computer:

- **Windows**: `C:\Users\YourName\AppData\Roaming\pkm-system-enhanced\`
- **macOS**: `~/Library/Application Support/pkm-system-enhanced/`
- **Linux**: `~/.config/pkm-system-enhanced/`

The database file (`pkm.db`) contains all your notes, flashcards, and settings. You can backup this file to keep your data safe.

## Uninstallation

### Windows

1. Go to Settings > Apps > Apps & features
2. Find "PKM System"
3. Click Uninstall

### macOS

1. Open Applications folder
2. Drag "PKM System" to Trash
3. Empty Trash

**Note**: Your data will remain in the app data folder. To completely remove:
- Delete: `~/Library/Application Support/pkm-system-enhanced/`

### Linux

**AppImage**: Simply delete the AppImage file

**Debian package**:
```bash
sudo apt remove pkm-system
```

## Troubleshooting

### App won't start

1. Make sure you have the latest version of your operating system
2. Try restarting your computer
3. Check if antivirus software is blocking the app

### macOS: "App is damaged" or "Cannot be opened"

This is a Gatekeeper security feature. To fix:

1. Right-click the app
2. Select "Open"
3. Click "Open" in the security dialog
4. The app will launch and be trusted for future launches

Alternatively, run in Terminal:
```bash
xattr -cr /Applications/PKM\ System.app
```

### Windows: Antivirus warning

Some antivirus software may flag Electron apps. This is usually a false positive. You can:
- Add an exception for the app
- Use Windows Defender (which should recognize it as safe)

### Linux: AppImage won't run

Make sure it's executable:
```bash
chmod +x PKM\ System-x.x.x.AppImage
```

If you're using a desktop environment, you may need to:
1. Right-click the file
2. Go to Properties > Permissions
3. Check "Allow executing file as program"

## Getting Help

If you encounter any issues:

1. Check the troubleshooting section above
2. Make sure you're using the latest version
3. Check that your system meets the requirements

## Privacy

- All data is stored locally on your computer
- No data is sent to external servers
- No internet connection required (except for Forvo pronunciation feature)
- Your notes and flashcards are completely private

## Updates

To update to a new version:

1. Download the new installer/package
2. Install it (it will replace the old version)
3. Your data will be preserved automatically

**Note**: It's always a good idea to backup your `pkm.db` file before updating, just in case.

