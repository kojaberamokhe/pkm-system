# Enhanced PKM System - Obsidian-Like Knowledge Management

A sophisticated Personal Knowledge Management system built with Electron and React, featuring multi-parent note hierarchies, rich media support, and FSRS spaced repetition.

## 🌟 Key Features

### Multi-Parent Note System
- **Unique Hierarchy**: Notes can appear under multiple parent notes
- **Wiki-Style Links**: Use `[[note title]]` to create automatic parent-child relationships
- **Visual Indicators**: See which notes have multiple parents in the tree view
- **Flexible Organization**: Same note can be organized under different contexts

### Rich Media Support
- **Images**: Embed images directly in notes and flashcards
- **Audio**: Add audio files to notes and cards
- **Forvo Integration**: Automatically fetch pronunciation audio for language learning
- **Media Gallery**: View all media attached to notes

### Advanced Flashcards
- **Rich Content**: Add images and audio to both sides of cards
- **Multiple Card Types**: Basic, Cloze, Type-in
- **Reverse Cards**: Automatically create reverse cards
- **FSRS Algorithm**: State-of-the-art spaced repetition
- **Flashcard Notes**: Special note type dedicated to flashcards

### Obsidian-Like UI
- **Dark/Light Themes**: Easy on the eyes
- **Tree View**: Hierarchical folder and note structure
- **Clickable Links**: Navigate between notes seamlessly
- **Drag & Drop**: Reorganize your knowledge tree
- **Context Menus**: Quick actions on right-click

## 📁 Project Structure

```
enhanced-pkm/
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx           # Tree view with multi-parent support
│   │   ├── NoteEditor.jsx        # Rich editor with media
│   │   ├── CardsView.jsx         # Advanced flashcard editor
│   │   ├── ReviewView.jsx        # FSRS-powered review
│   │   ├── StatsView.jsx         # Learning statistics
│   │   └── SettingsView.jsx      # Configuration
│   ├── utils/
│   │   └── fsrs.js              # FSRS-4.5 algorithm
│   ├── App.jsx                  # Main application
│   ├── App.css                  # Comprehensive styling
│   ├── main.jsx                 # React entry point
│   └── index.css                # Global styles
├── main.js                      # Electron main process
├── preload.js                   # Electron preload script
├── package.json
└── vite.config.js
```

## 🗄️ Database Schema

### Enhanced Tables

**notes**
- Multi-parent support via `note_relationships` table
- `note_type`: 'note' or 'flashcard'
- `is_flashcard_note`: Boolean flag

**note_relationships**
- Links parent notes to child notes
- Supports multiple parents per child
- Created automatically from `[[links]]`

**cards**
- Rich media fields: `front_audio`, `back_audio`, `front_image`, `back_image`
- `card_type`: 'basic', 'cloze', 'type-in'
- FSRS scheduling data

**media**
- Track all uploaded media files
- Link to notes
- Store metadata (size, type, etc.)

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (https://nodejs.org/)
- npm or yarn

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Run in development:**
```bash
npm run dev
```

This will:
- Start Vite dev server on port 3000
- Launch Electron with hot-reload
- Open DevTools automatically

## 🎯 How to Use

### Creating Notes and Building Hierarchy

1. **Create a Note**
   - Click the file icon with `+` in the sidebar
   - Or use the context menu

2. **Link Notes**
   - Use `[[Note Title]]` syntax in content
   - Links automatically create parent-child relationships
   - Click links to navigate

3. **Multi-Parent Structure**
   - Link to a note from multiple parents
   - The child note appears under all parents in the tree
   - Visual badge shows number of parents

### Adding Media

1. **Images**
   - Click the image icon in the note editor
   - Select an image file
   - It's automatically embedded in your note

2. **Audio**
   - Click the audio icon
   - Select an audio file
   - Audio player embedded in note

### Creating Flashcards

1. **Standard Flashcards**
   - Select a note
   - Go to Cards tab
   - Click "New Card"
   - Fill in front and back
   - Add images/audio as needed

2. **Flashcard Notes**
   - Check "Flashcard Note" in note editor
   - These notes appear with a special icon
   - Nest under relevant content notes

3. **Forvo Pronunciation**
   - In card editor, use "Fetch from Forvo" section
   - Enter word and select language
   - Automatically downloads pronunciation
   - Requires Forvo API key (Settings)

### Reviewing Cards

1. Navigate to Review tab
2. Click "Show Answer" (or press Space)
3. Rate yourself:
   - **Fail (F)**: Got the card wrong - maps to FSRS Again
   - **Pass (Space/P)**: Got the card correct with no issue - maps to FSRS Easy

## ⚙️ Configuration

### Forvo API Setup

1. Sign up at https://api.forvo.com/
2. Get your API key
3. Go to Settings tab
4. Enter API key
5. Now you can fetch pronunciations!

### FSRS Parameters

Adjust in Settings:
- **Request Retention**: Target retention rate (0-1)
- **Maximum Interval**: Max days between reviews

## 🎨 Themes

Toggle between Dark and Light themes using the button in the titlebar.

Themes automatically persist between sessions.

## 🔧 Building for Distribution

For detailed instructions on building and distributing the application:

- **Windows builds**: See [BUILD_WINDOWS.md](BUILD_WINDOWS.md)
- **Installation instructions**: See [INSTALLATION_INSTRUCTIONS.md](INSTALLATION_INSTRUCTIONS.md)

Quick start:
```bash
# Install dependencies
npm install

# Build React app
npm run build

# Create installer
npm run package
```

Installers will be in the `release/` folder:
- Windows: `.exe` installer (NSIS)
- macOS: `.dmg` disk image
- Linux: `.AppImage` and `.deb` package

For installation instructions for end users, see [INSTALLATION_INSTRUCTIONS.md](INSTALLATION_INSTRUCTIONS.md).

## 📊 Database Location

Your data is stored in:
- **Windows**: `%APPDATA%/pkm-system-enhanced/pkm.db`
- **macOS**: `~/Library/Application Support/pkm-system-enhanced/pkm.db`
- **Linux**: `~/.config/pkm-system-enhanced/pkm.db`

Media files are in a `media/` subdirectory.

## 🆚 Advantages Over Standard PKM Systems

### vs. Obsidian
✅ Built-in FSRS flashcards (Obsidian requires plugins)
✅ Multi-parent visualization in tree view
✅ Integrated media management
✅ Native app with full filesystem access

### vs. Anki
✅ Wiki-style note linking
✅ Hierarchical organization
✅ Rich text notes alongside cards
✅ Context-aware learning

### vs. Notion
✅ Local-first (your data stays on your machine)
✅ No subscription required
✅ Faster performance
✅ Full offline support

## 🔑 Keyboard Shortcuts

- `Ctrl/Cmd + S` - Save note
- `Ctrl/Cmd + F` - Focus search
- `Space` - Show answer or mark as Pass (during review)
- `F` - Mark as Fail (during review)
- `P` - Mark as Pass (during review)
- `Ctrl/Cmd + N` - New note

## 🐛 Troubleshooting

### "API key not set" error
- Go to Settings and add your Forvo API key
- Save settings before trying to fetch audio

### Cards not appearing in review
- Check that cards have a due date
- Verify cards are attached to a note

### Images not displaying
- Ensure images were added through the app
- Check that media files exist in the media directory

### Database issues
1. Close the app
2. Locate the database file
3. Make a backup
4. Restart the app (it will recreate if corrupted)

## 📝 Tips for Effective Use

1. **Link Liberally**: Create connections between related concepts
2. **Use Flashcard Notes**: Keep card sets organized under topic notes
3. **Review Daily**: Spaced repetition works best with consistency
4. **Tag Strategically**: Use tags for cross-cutting themes
5. **Media for Memory**: Images and audio improve retention
6. **Hierarchical Thinking**: Organize from general to specific

## 🔮 Future Enhancements

- Graph view visualization
- Export to Anki, Obsidian formats
- Cloud sync options
- Mobile companion app
- Plugin system
- AI-powered suggestions

## 📄 License

MIT License - see LICENSE file

## 🙏 Acknowledgments

- FSRS Algorithm by Jarrett Ye
- Lucide Icons
- Electron & React communities

---

**Happy Learning! 🎓**
