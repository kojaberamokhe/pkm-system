# Architecture Documentation

## System Overview

This PKM system uses a hybrid architecture combining Electron (for native desktop capabilities) with React (for the UI), SQLite (for data persistence), and the FSRS algorithm (for spaced repetition).

## Multi-Parent Note System

### How It Works

The system uses a many-to-many relationship table to track parent-child note relationships:

```
notes table:
- id
- title
- content
- ...

note_relationships table:
- id
- parent_note_id → notes.id
- child_note_id → notes.id
- created_at

links table (for tracking raw [[links]]):
- id
- from_note_id → notes.id
- to_note_title
- created_at
```

### Link Processing Flow

1. User types `[[Note Title]]` in a note
2. On save, `updateLinks()` function extracts all `[[...]]` patterns
3. For each link:
   - Create entry in `links` table
   - Look up if target note exists
   - If exists, create entry in `note_relationships`
4. Sidebar queries `note_relationships` to build tree
5. A note can have multiple entries in `note_relationships` with different `parent_note_id` values

### Tree Rendering

The Sidebar component recursively renders:
1. Root folders (where `parent_id IS NULL`)
2. For each folder:
   - Subfolders (where `parent_id = folder.id`)
   - Root notes (where `folder_id = folder.id` AND note not in `note_relationships` as child)
3. For each note:
   - Child notes (from `note_relationships` where `parent_note_id = note.id`)
4. Same child note can appear multiple times under different parents

## Data Flow

### Main Process (Electron)

```
main.js
├── Database initialization (sql.js)
├── IPC handlers for all CRUD operations
├── Media file management
├── Forvo API integration
└── Auto-save on app close
```

### Renderer Process (React)

```
App.jsx (State Management)
├── Current view
├── Selected note/folder
├── Search state
└── Stats

Components communicate via props:
- Sidebar → App: onNoteSelect, onFolderSelect
- App → NoteEditor: selected note, onUpdate callback
- NoteEditor → App: triggers reload on save
```

### IPC Communication

```
Renderer Process          Preload Script          Main Process
┌──────────────┐         ┌──────────────┐        ┌────────────┐
│ Component    │────────▶│ window.api   │───────▶│ IPC Handler│
│ .create()    │         │ .notes       │        │ DB Query   │
└──────────────┘         │ .create()    │        └────────────┘
                         └──────────────┘              │
                                                       ▼
                                                  ┌─────────┐
                                                  │ SQLite  │
                                                  └─────────┘
```

## FSRS Implementation

### Algorithm Flow

```
calculateNextReview(card, rating)
├── If NEW card:
│   ├── init_difficulty(rating)
│   ├── init_stability(rating)
│   └── schedule based on rating
└── If REVIEW:
    ├── Calculate retrievability (time-based forgetting)
    ├── If rating == 1 (Again):
    │   └── next_forget_stability()
    └── If rating > 1:
        ├── next_recall_stability()
        └── next_difficulty()
```

### Parameters

```javascript
w = [w0, w1, ..., w16]  // 17 parameters
- w[0-3]: Initial stability for ratings 1-4
- w[4-5]: Initial difficulty calculation
- w[6]: Difficulty change rate
- w[8-10]: Recall stability factors
- w[11-14]: Forget stability factors
- w[15-16]: Hard penalty & Easy bonus
```

## Media Management

### File Storage

```
App Data Directory
├── pkm.db (SQLite database)
└── media/
    ├── 1234567890_image.jpg
    ├── 1234567891_audio.mp3
    └── forvo_hello_en_1234567892.mp3
```

### Media Flow

1. User clicks "Add Image/Audio"
2. Native file dialog opens (via Electron)
3. File copied to media directory with timestamp prefix
4. Entry created in `media` table
5. Path embedded in note content
6. React component renders using `file://` protocol

### Forvo Integration

```
fetchFromForvo(word, language)
├── Call Forvo API: /word-pronunciations/word/{word}/language/{lang}
├── Get highest-rated pronunciation
├── Download MP3 file
├── Save to media directory
└── Return filepath
```

## Component Architecture

### Sidebar (Tree View)

```
Sidebar
├── FolderNode (recursive)
│   ├── Render folder
│   ├── Load subfolders
│   ├── Load notes in folder
│   └── For each note → NoteNode
└── NoteNode (recursive)
    ├── Render note
    ├── Load child notes (from note_relationships)
    ├── Show multi-parent badge if > 1 parent
    └── For each child → NoteNode (recursive)
```

### NoteEditor (Content Editor)

```
NoteEditor
├── Title input
├── Metadata (tags, flashcard checkbox)
├── Parent notes display (if multi-parent)
├── Content editor/preview toggle
│   ├── Edit mode: textarea
│   └── Preview mode: clickable [[links]]
├── Media section (images, audio)
└── Backlinks section
```

### CardsView (Flashcard Manager)

```
CardsView
├── Card list (filtered by selected note)
├── Card editor
│   ├── Front/Back inputs
│   ├── Media controls (image, audio)
│   ├── Forvo fetcher
│   └── Options (reverse, card type)
└── Card display
    ├── Content preview
    ├── Stats (reps, difficulty, stability)
    └── Actions (edit, delete)
```

### ReviewView (SRS Review)

```
ReviewView
├── Load due cards
├── Display current card
│   ├── Show front
│   ├── Play audio (if present)
│   ├── Show image (if present)
│   └── On "Show Answer":
│       ├── Display back
│       ├── Play back audio
│       └── Show rating buttons
└── On rating:
    ├── Calculate next review (FSRS)
    ├── Update card in database
    └── Load next card
```

## State Management

### React State Flow

```
App.jsx maintains:
- selectedNote (which note is open)
- selectedFolder (which folder is selected)
- currentView (which tab is active)
- searchQuery & searchResults
- stats (for badge counts)

Updates propagate:
1. User action in Sidebar → App updates selectedNote
2. App passes selectedNote to NoteEditor
3. NoteEditor modifies → calls onUpdate callback
4. App reloads stats and refreshes Sidebar
```

### Database Transactions

All database operations are synchronous (sql.js) and automatically saved:

```javascript
// Pattern for all mutations:
db.run('INSERT INTO ...')  // Execute query
const result = db.exec('SELECT last_insert_rowid()')  // Get result
saveDatabase()  // Write to disk
return result
```

## Performance Considerations

### Tree Rendering Optimization

- Only load children when node is expanded
- Use `expandedFolders` and `expandedNotes` Sets for O(1) lookup
- Memoize child note queries

### Search Optimization

- SQLite FTS (Full-Text Search) for content search
- LIKE queries with indexes on title
- Limit results to prevent UI lag

### Media Handling

- Use `file://` protocol for zero-copy display
- Lazy load images (only render when visible)
- Audio elements load on demand

## Security Considerations

### Context Isolation

- `contextBridge` exposes only specific API methods
- No direct Node.js access from renderer
- IPC handlers validate all inputs

### File System Access

- Media files stored in app data directory
- User files copied (not referenced directly)
- No path traversal vulnerabilities

## Extension Points

### Adding New Note Types

1. Add `note_type` enum value
2. Create type-specific renderer in NoteEditor
3. Add icon mapping in Sidebar
4. Add type filter in queries

### Custom Card Types

1. Extend `card_type` enum
2. Implement rendering logic in CardsView
3. Update FSRS algorithm if needed

### Plugin System (Future)

Could add:
- `/plugins` directory scanning
- Plugin manifest (JSON)
- Hook system for lifecycle events
- Custom UI components via React portals

## Testing Strategy

### Unit Tests (Future)

- FSRS calculations (pure functions)
- Link parsing logic
- Date/time utilities

### Integration Tests

- IPC communication
- Database queries
- Media file operations

### E2E Tests

- Note creation flow
- Card review flow
- Search functionality

## Deployment

### Build Process

```
npm run build
├── Vite builds React app → /build
├── electron-builder packages:
│   ├── Copies main.js, preload.js
│   ├── Bundles dependencies
│   ├── Creates installer
│   └── Outputs to /dist
└── Platform-specific installers created
```

### Auto-Update (Future)

Could implement:
- electron-updater
- Check for updates on launch
- Download and install in background
- Notify user on next restart

## Database Migrations

Currently schema is created on first run. For future versions:

```javascript
// Version tracking
CREATE TABLE schema_version (version INTEGER);

// Migration system
function migrateDatabase(currentVersion) {
  if (currentVersion < 2) {
    // Add new columns, tables, etc.
  }
  if (currentVersion < 3) {
    // More migrations
  }
}
```

## Backup Strategy

User should backup:
- Database file (`pkm.db`)
- Media directory

Could add:
- Auto-backup on app close
- Export to ZIP
- Cloud sync integration

---

This architecture provides a solid foundation for a feature-rich PKM system while maintaining good separation of concerns and extensibility.
