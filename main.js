const { app, BrowserWindow, ipcMain, dialog, session, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

let mainWindow;
let db;
let SQL;

async function initDatabase() {
  SQL = await initSqlJs();
  const dbPath = path.join(app.getPath('userData'), 'pkm.db');
  
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Enhanced schema with note types, multi-parent support, and media
  db.run(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL UNIQUE,
      content TEXT,
      tags TEXT,
      note_type TEXT DEFAULT 'note',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      folder_id INTEGER,
      is_flashcard_note INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS note_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_note_id INTEGER NOT NULL,
      child_note_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (parent_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (child_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      UNIQUE(parent_note_id, child_note_id)
    );
    
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      front_audio TEXT,
      back_audio TEXT,
      front_image TEXT,
      back_image TEXT,
      stability REAL DEFAULT 0,
      difficulty REAL DEFAULT 0,
      reps INTEGER DEFAULT 0,
      lapses INTEGER DEFAULT 0,
      state INTEGER DEFAULT 0,
      last_review TEXT,
      due TEXT,
      note_id INTEGER,
      is_reversed INTEGER DEFAULT 0,
      parent_card_id INTEGER,
      extra_fields TEXT DEFAULT '{}',
      card_type TEXT DEFAULT 'basic',
      direction TEXT DEFAULT 'front-to-back',
      buried_until TEXT,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_note_id INTEGER,
      to_note_title TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      media_type TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL,
      note_id INTEGER,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    
    CREATE TABLE IF NOT EXISTS flashcard_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      fields TEXT NOT NULL,
      create_reverse INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS note_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_note_relationships_parent ON note_relationships(parent_note_id);
    CREATE INDEX IF NOT EXISTS idx_note_relationships_child ON note_relationships(child_note_id);
    CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_note_id);
    CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_note_title);
    CREATE INDEX IF NOT EXISTS idx_cards_note ON cards(note_id);
    CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due);
    CREATE INDEX IF NOT EXISTS idx_media_note ON media(note_id);
  `);
  
  // Migration: Add direction and buried_until columns if they don't exist (for existing databases)
  try {
    const tableInfo = db.exec("PRAGMA table_info(cards)");
    if (tableInfo[0] && tableInfo[0].values) {
      const hasDirection = tableInfo[0].values.some(col => col[1] === 'direction');
      if (!hasDirection) {
        db.run('ALTER TABLE cards ADD COLUMN direction TEXT DEFAULT "front-to-back"');
        saveDatabase();
      }
      const hasBuriedUntil = tableInfo[0].values.some(col => col[1] === 'buried_until');
      if (!hasBuriedUntil) {
        db.run('ALTER TABLE cards ADD COLUMN buried_until TEXT');
        saveDatabase();
      }
    }
  } catch (e) {
    // If table doesn't exist yet, that's fine - it will be created with the column
    console.log('Card columns migration check:', e.message);
  }
  
  saveDatabase();
}

function saveDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'pkm.db');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#1e1e1e',
    title: 'PKM System',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#ffffff'
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Folders
ipcMain.handle('folders:getAll', () => {
  const result = db.exec(`
    SELECT f.*,
      (SELECT COUNT(*) FROM folders cf WHERE cf.parent_id = f.id) AS child_folder_count,
      (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS child_note_count
    FROM folders f
    ORDER BY f.name
  `);
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    name: row[1],
    parent_id: row[2],
    created_at: row[3],
    updated_at: row[4],
    child_folder_count: row[5] || 0,
    child_note_count: row[6] || 0,
    item_count: (row[5] || 0) + (row[6] || 0)
  })) : [];
});

ipcMain.handle('folders:getByParent', (event, parentId) => {
  let result;
  if (parentId === null) {
    result = db.exec(`
      SELECT f.*,
        (SELECT COUNT(*) FROM folders cf WHERE cf.parent_id = f.id) AS child_folder_count,
        (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS child_note_count
      FROM folders f
      WHERE f.parent_id IS NULL
      ORDER BY f.name
    `);
  } else {
    result = db.exec(`
      SELECT f.*,
        (SELECT COUNT(*) FROM folders cf WHERE cf.parent_id = f.id) AS child_folder_count,
        (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS child_note_count
      FROM folders f
      WHERE f.parent_id = ?
      ORDER BY f.name
    `, [parentId]);
  }
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    name: row[1],
    parent_id: row[2],
    created_at: row[3],
    updated_at: row[4],
    child_folder_count: row[5] || 0,
    child_note_count: row[6] || 0,
    item_count: (row[5] || 0) + (row[6] || 0)
  })) : [];
});

ipcMain.handle('folders:create', (event, { name, parentId }) => {
  try {
    if (!name || !name.trim()) {
      throw new Error('Folder name is required');
    }
    
    // Ensure parentId is null if undefined
    const normalizedParentId = (parentId === undefined || parentId === null) ? null : parentId;
    
    const now = new Date().toISOString();
    
    // Use prepared statement for sql.js
    const stmt = db.prepare('INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)');
    stmt.bind([name.trim(), normalizedParentId, now, now]);
    stmt.step();
    stmt.free();
    
    const result = db.exec('SELECT last_insert_rowid()');
    const folderId = result[0].values[0][0];
    
    saveDatabase();
    
    console.log('Created folder:', { id: folderId, name: name.trim(), parentId: normalizedParentId });
    return folderId;
  } catch (error) {
    console.error('Error creating folder:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
});

ipcMain.handle('folders:update', (event, { id, name, parentId }) => {
  const now = new Date().toISOString();
  db.run('UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?', 
    [name, parentId, now, id]);
  saveDatabase();
  return true;
});
ipcMain.handle('folders:move', (event, { folderId, newParentId }) => {
  // Prevent moving a folder into itself
  if (folderId === newParentId) {
    console.error('Cannot move folder into itself');
    return false;
  }
  
  // Prevent circular references: check if newParentId is a descendant of folderId
  if (newParentId !== null) {
    const checkCircular = (checkFolderId, targetParentId) => {
      if (checkFolderId === targetParentId) return true;
      const parentResult = db.exec('SELECT parent_id FROM folders WHERE id = ?', [checkFolderId]);
      if (parentResult[0] && parentResult[0].values.length > 0) {
        const parentId = parentResult[0].values[0][0];
        if (parentId === null) return false;
        return checkCircular(parentId, targetParentId);
      }
      return false;
    };
    
    if (checkCircular(newParentId, folderId)) {
      console.error('Cannot move folder: would create circular reference');
      return false;
    }
  }
  
  const now = new Date().toISOString();
  db.run('UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?', [newParentId, now, folderId]);
  saveDatabase();
  return true;
});


ipcMain.handle('folders:delete', (event, id) => {
  const deleteFolderRecursive = (folderId) => {
    const childFolders = db.exec('SELECT id FROM folders WHERE parent_id = ?', [folderId]);
    if (childFolders[0]) {
      for (const row of childFolders[0].values) {
        deleteFolderRecursive(row[0]);
      }
    }
    db.run('UPDATE notes SET folder_id = NULL WHERE folder_id = ?', [folderId]);
    db.run('DELETE FROM folders WHERE id = ?', [folderId]);
  };

  deleteFolderRecursive(id);
  saveDatabase();
  return true;
});

// Notes with multi-parent support
// Notes can appear in multiple places - show them in folders AND as children
ipcMain.handle('notes:getAll', (event, { folderId }) => {
  let result;
  if (folderId === null) {
    // Root level: show notes that are NOT children of any parent (only top-level)
    // Also include orphaned notes (children whose parent doesn't exist)
    result = db.exec(`
      SELECT DISTINCT 
        n.id,
        n.title,
        n.tags,
        n.note_type,
        n.is_flashcard_note,
        n.created_at,
        (
          SELECT COUNT(*)
          FROM note_relationships nr
          WHERE nr.parent_note_id = n.id
        ) as child_count
      FROM notes n 
      WHERE n.folder_id IS NULL 
      AND (
        n.id NOT IN (SELECT DISTINCT child_note_id FROM note_relationships WHERE child_note_id IS NOT NULL)
        OR n.id IN (
          SELECT DISTINCT nr.child_note_id 
          FROM note_relationships nr
          WHERE nr.child_note_id IS NOT NULL
          AND nr.parent_note_id NOT IN (SELECT id FROM notes)
        )
      )
      ORDER BY n.title ASC
    `);
  } else {
    // Folder level: show notes in this folder (even if they're also children elsewhere)
    result = db.exec(`
      SELECT DISTINCT 
        n.id,
        n.title,
        n.tags,
        n.note_type,
        n.is_flashcard_note,
        n.created_at,
        (
          SELECT COUNT(*)
          FROM note_relationships nr
          WHERE nr.parent_note_id = n.id
        ) as child_count
      FROM notes n 
      WHERE n.folder_id = ? 
      ORDER BY n.title ASC
    `, [folderId]);
  }
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    title: row[1],
    tags: row[2],
    note_type: row[3],
    is_flashcard_note: row[4],
    created_at: row[5],
    child_count: row[6] || 0
  })) : [];
});

ipcMain.handle('notes:getChildren', (event, parentNoteId) => {
  const result = db.exec(`
    SELECT DISTINCT 
      n.id,
      n.title,
      n.tags,
      n.note_type,
      n.is_flashcard_note,
      n.created_at,
      (
        SELECT COUNT(*)
        FROM note_relationships nr2
        WHERE nr2.parent_note_id = n.id
      ) as child_count
    FROM notes n 
    JOIN note_relationships nr ON n.id = nr.child_note_id 
    WHERE nr.parent_note_id = ?
    ORDER BY n.title ASC
  `, [parentNoteId]);
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    title: row[1],
    tags: row[2],
    note_type: row[3],
    is_flashcard_note: row[4],
    created_at: row[5],
    child_count: row[6] || 0
  })) : [];
});

ipcMain.handle('notes:getParents', (event, childNoteId) => {
  const result = db.exec(`
    SELECT DISTINCT n.id, n.title 
    FROM notes n 
    JOIN note_relationships nr ON n.id = nr.parent_note_id 
    WHERE nr.child_note_id = ?
  `, [childNoteId]);
  return result[0] ? result[0].values.map(row => ({
    id: row[0], title: row[1]
  })) : [];
});

ipcMain.handle('notes:getById', (event, id) => {
  const result = db.exec('SELECT * FROM notes WHERE id = ?', [id]);
  if (result[0] && result[0].values.length > 0) {
    const row = result[0].values[0];
    return {
      id: row[0], title: row[1], content: row[2], tags: row[3],
      note_type: row[4], created_at: row[5], updated_at: row[6], 
      folder_id: row[7], is_flashcard_note: row[8]
    };
  }
  return null;
});

ipcMain.handle('notes:getByTitle', (event, title) => {
  const result = db.exec('SELECT * FROM notes WHERE title = ?', [title]);
  if (result[0] && result[0].values.length > 0) {
    const row = result[0].values[0];
    return {
      id: row[0], title: row[1], content: row[2], tags: row[3],
      note_type: row[4], created_at: row[5], updated_at: row[6], 
      folder_id: row[7], is_flashcard_note: row[8]
    };
  }
  return null;
});

ipcMain.handle('notes:search', (event, query) => {
  const pattern = `%${query}%`;
  const result = db.exec(`
    SELECT id, title, tags, note_type, is_flashcard_note 
    FROM notes 
    WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
    ORDER BY created_at DESC
  `, [pattern, pattern, pattern]);
  return result[0] ? result[0].values.map(row => ({
    id: row[0], title: row[1], tags: row[2], note_type: row[3], is_flashcard_note: row[4]
  })) : [];
});

ipcMain.handle('notes:create', (event, { title, content, tags, folderId, noteType, isFlashcardNote }) => {
  // Generate a unique title if the requested title already exists
  let finalTitle = title;
  let counter = 1;
  
  while (true) {
    const existing = db.exec('SELECT id FROM notes WHERE title = ?', [finalTitle]);
    if (!existing[0] || existing[0].values.length === 0) {
      // Title is unique, break out of loop
      break;
    }
    // Title exists, try with a number appended
    counter++;
    finalTitle = `${title} ${counter}`;
  }
  
  const now = new Date().toISOString();
  try {
    db.run(`
      INSERT INTO notes (title, content, tags, created_at, updated_at, folder_id, note_type, is_flashcard_note) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [finalTitle, content, tags, now, now, folderId, noteType || 'note', isFlashcardNote ? 1 : 0]);
    
    const result = db.exec('SELECT last_insert_rowid()');
    const noteId = result[0].values[0][0];
    updateLinks(noteId, content);
    saveDatabase();
    return noteId;
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      // This shouldn't happen now, but handle it just in case
      throw new Error(`A note with the title "${finalTitle}" already exists. Please use a different title.`);
    }
    throw error;
  }
});

ipcMain.handle('notes:update', (event, { id, title, content, tags, folderId, noteType, isFlashcardNote }) => {
  try {
    // Check if title is being changed and if another note with that title exists
    if (title) {
      const existing = db.exec('SELECT id FROM notes WHERE title = ? AND id != ?', [title, id]);
      if (existing[0] && existing[0].values.length > 0) {
        throw new Error(`A note with the title "${title}" already exists. Please use a different title.`);
      }
    }
    
    const now = new Date().toISOString();
    
    // Handle null folderId properly
    const folderIdValue = folderId !== undefined && folderId !== null ? folderId : null;
    const tagsValue = tags || '';
    const contentValue = content || '';
    
    try {
      // Get existing note to preserve note_type and is_flashcard_note if not provided
      const existing = db.exec('SELECT note_type, is_flashcard_note FROM notes WHERE id = ?', [id]);
      const existingNoteType = existing[0] && existing[0].values.length > 0 ? existing[0].values[0][0] : 'note';
      const existingIsFlashcard = existing[0] && existing[0].values.length > 0 ? existing[0].values[0][1] : 0;
      
      // Use provided values or preserve existing ones
      const finalNoteType = noteType !== undefined ? noteType : existingNoteType;
      const finalIsFlashcardNote = isFlashcardNote !== undefined ? (isFlashcardNote ? 1 : 0) : existingIsFlashcard;
      
      db.run(`
        UPDATE notes 
        SET title = ?, content = ?, tags = ?, folder_id = ?, note_type = ?, 
            is_flashcard_note = ?, updated_at = ?
        WHERE id = ?
      `, [
        title || '', 
        contentValue,
        tagsValue,
        folderIdValue,
        finalNoteType,
        finalIsFlashcardNote,
        now,
        id
      ]);
      
      updateLinks(id, contentValue);
      saveDatabase();
      return true;
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE constraint')) {
        throw new Error(`A note with the title "${title}" already exists. Please use a different title.`);
      }
      throw error;
    }
  } catch (error) {
    console.error('Error updating note:', error);
    throw error;
  }
});

ipcMain.handle('notes:delete', (event, id) => {
  try {
    // Delete in order to respect foreign key constraints
    // First delete relationships and cards (they reference notes)
    db.run('DELETE FROM note_relationships WHERE parent_note_id = ? OR child_note_id = ?', [id, id]);
  db.run('DELETE FROM links WHERE from_note_id = ?', [id]);
  db.run('DELETE FROM cards WHERE note_id = ?', [id]);
    // Delete media associated with the note
    const mediaResult = db.exec('SELECT filepath FROM media WHERE note_id = ?', [id]);
    if (mediaResult[0] && mediaResult[0].values.length > 0) {
      mediaResult[0].values.forEach(row => {
        const filepath = row[0];
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        } catch (err) {
          console.error('Error deleting media file:', err);
        }
      });
    }
    db.run('DELETE FROM media WHERE note_id = ?', [id]);
    // Finally delete the note itself
    db.run('DELETE FROM notes WHERE id = ?', [id]);
  saveDatabase();
  return true;
  } catch (error) {
    console.error('Error deleting note:', error);
    throw error;
  }
});

ipcMain.handle('notes:move', (event, { noteId, folderId, parentNoteId }) => {
  const now = new Date().toISOString();
  
  // Ensure folderId is null instead of undefined
  const folderIdValue = folderId !== undefined ? folderId : null;
  
  // Update folder_id
  db.run('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?', [folderIdValue, now, noteId]);
  
  // Handle parent-child relationships
  // First, remove any existing parent relationships for this note
  db.run('DELETE FROM note_relationships WHERE child_note_id = ?', [noteId]);
  
  // If parentNoteId is provided, create the new relationship
  if (parentNoteId !== null && parentNoteId !== undefined) {
    try {
      db.run(`
        INSERT OR IGNORE INTO note_relationships (parent_note_id, child_note_id, created_at) 
        VALUES (?, ?, ?)
      `, [parentNoteId, noteId, now]);
    } catch (e) {
      console.error('Error creating note relationship:', e);
    }
  }
  
  saveDatabase();
  return true;
});

ipcMain.handle('notes:getBacklinks', (event, title) => {
  const result = db.exec(`
    SELECT n.id, n.title 
    FROM notes n 
    JOIN links l ON n.id = l.from_note_id 
    WHERE l.to_note_title = ?
  `, [title]);
  return result[0] ? result[0].values.map(row => ({ id: row[0], title: row[1] })) : [];
});

function updateLinks(noteId, content) {
  // Delete existing links
  db.run('DELETE FROM links WHERE from_note_id = ?', [noteId]);
  db.run('DELETE FROM note_relationships WHERE parent_note_id = ?', [noteId]);
  
  if (!content) return;
  
  const now = new Date().toISOString();
  const linkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const linkedTitle = match[1];
    
    // Create link entry
    db.run('INSERT INTO links (from_note_id, to_note_title, created_at) VALUES (?, ?, ?)', 
      [noteId, linkedTitle, now]);
    
    // Check if linked note exists
    const result = db.exec('SELECT id FROM notes WHERE title = ?', [linkedTitle]);
    if (result[0] && result[0].values.length > 0) {
      const linkedNoteId = result[0].values[0][0];
      
      // Create parent-child relationship
      try {
        db.run(`
          INSERT OR IGNORE INTO note_relationships (parent_note_id, child_note_id, created_at) 
          VALUES (?, ?, ?)
        `, [noteId, linkedNoteId, now]);
      } catch (e) {
        console.error('Error creating relationship:', e);
      }
    }
  }
}

// Enhanced Cards with media support
ipcMain.handle('cards:getAll', () => {
  const result = db.exec('SELECT * FROM cards ORDER BY id');
  return result[0] ? result[0].values.map(row => ({
    id: row[0], front: row[1], back: row[2], front_audio: row[3], back_audio: row[4],
    front_image: row[5], back_image: row[6], stability: row[7], difficulty: row[8],
    reps: row[9], lapses: row[10], state: row[11], last_review: row[12], due: row[13],
    note_id: row[14], is_reversed: row[15], parent_card_id: row[16], 
    extra_fields: row[17], card_type: row[18], direction: row[19] || 'front-to-back',
    buried_until: row[20] || null
  })) : [];
});

ipcMain.handle('cards:getDue', () => {
  const now = new Date().toISOString();
  
  // Get settings
  const burySiblingsResult = db.exec('SELECT value FROM settings WHERE key = ?', ['bury_sibling_cards']);
  const burySiblings = burySiblingsResult[0] && burySiblingsResult[0].values.length > 0 
    ? burySiblingsResult[0].values[0][0] === 'true' 
    : false;
  
  const newCardsFirstResult = db.exec('SELECT value FROM settings WHERE key = ?', ['review_new_cards_first']);
  const newCardsFirst = newCardsFirstResult[0] && newCardsFirstResult[0].values.length > 0 
    ? newCardsFirstResult[0].values[0][0] === 'true' 
    : false;
  
  // Get all due cards, excluding buried ones
  // A card is buried if buried_until exists and is greater than now
  // Show card if: buried_until IS NULL (not buried) OR buried_until <= now (burial period expired)
  let query = 'SELECT * FROM cards WHERE due <= ? AND (buried_until IS NULL OR buried_until <= ?)';
  const params = [now, now];
  
  if (newCardsFirst) {
    // Sort: new cards (state = 0) first, then by due date
    query += ' ORDER BY state ASC, due ASC';
  } else {
    query += ' ORDER BY due ASC';
  }
  
  const result = db.exec(query, params);
  const cards = result[0] ? result[0].values.map(row => ({
    id: row[0], front: row[1], back: row[2], front_audio: row[3], back_audio: row[4],
    front_image: row[5], back_image: row[6], stability: row[7], difficulty: row[8],
    reps: row[9], lapses: row[10], state: row[11], last_review: row[12], due: row[13],
    note_id: row[14], is_reversed: row[15], parent_card_id: row[16], 
    extra_fields: row[17], card_type: row[18], direction: row[19] || 'front-to-back',
    buried_until: row[20] || null
  })) : [];
  
  return cards;
});

ipcMain.handle('cards:getDueCount', () => {
  const now = new Date().toISOString();
  // Show card if: buried_until IS NULL (not buried) OR buried_until <= now (burial period expired)
  const result = db.exec('SELECT COUNT(*) FROM cards WHERE due <= ? AND (buried_until IS NULL OR buried_until <= ?)', [now, now]);
  return result[0] && result[0].values.length > 0 ? result[0].values[0][0] : 0;
});

ipcMain.handle('cards:getByNote', (event, noteId) => {
  const result = db.exec('SELECT * FROM cards WHERE note_id = ? ORDER BY id', [noteId]);
  return result[0] ? result[0].values.map(row => ({
    id: row[0], front: row[1], back: row[2], front_audio: row[3], back_audio: row[4],
    front_image: row[5], back_image: row[6], stability: row[7], difficulty: row[8],
    reps: row[9], lapses: row[10], state: row[11], last_review: row[12], due: row[13],
    note_id: row[14], is_reversed: row[15], parent_card_id: row[16], 
    extra_fields: row[17], card_type: row[18], direction: row[19] || 'front-to-back',
    buried_until: row[20] || null
  })) : [];
});

ipcMain.handle('cards:create', (event, cardData) => {
  const now = new Date().toISOString();
  
  // Support both old API (with named params) and new API (with cardData object)
  const front = cardData.front || '';
  const back = cardData.back || '';
  const noteId = cardData.note_id || cardData.noteId;
  const reverse = cardData.reverse || cardData.createReverse || false;
  const direction = cardData.direction || 'front-to-back';
  const extraFields = cardData.extraFields || cardData.extra_fields || {};
  const cardType = cardData.card_type || cardData.cardType || 'basic';
  const frontAudio = cardData.front_audio || cardData.frontAudio || null;
  const backAudio = cardData.back_audio || cardData.backAudio || null;
  const frontImage = cardData.front_image || cardData.frontImage || null;
  const backImage = cardData.back_image || cardData.backImage || null;
  
  // If direction is explicitly set, create only that card (don't auto-create reverse)
  // Otherwise, use the old behavior for backward compatibility
  if (direction && direction !== 'front-to-back') {
    // Creating a specific direction card (e.g., back-to-front)
    // Don't auto-create reverse card
    db.run(`
      INSERT INTO cards (front, back, note_id, due, extra_fields, card_type, front_audio, back_audio, front_image, back_image, direction) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [front, back, noteId, now, JSON.stringify(extraFields || {}), cardType, 
        frontAudio || null, backAudio || null, frontImage || null, backImage || null, direction]);
    
    const result = db.exec('SELECT last_insert_rowid()');
    const cardId = result[0].values[0][0];
    saveDatabase();
    return cardId;
  }
  
  // Default behavior: create front-to-back card
  db.run(`
    INSERT INTO cards (front, back, note_id, due, extra_fields, card_type, front_audio, back_audio, front_image, back_image, direction) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [front, back, noteId, now, JSON.stringify(extraFields || {}), cardType, 
      frontAudio || null, backAudio || null, frontImage || null, backImage || null, 'front-to-back']);
  
  const result = db.exec('SELECT last_insert_rowid()');
  const cardId = result[0].values[0][0];
  
  // Only create reverse card if reverse flag is set AND we're creating a front-to-back card
  if (reverse && direction === 'front-to-back') {
    db.run(`
      INSERT INTO cards (front, back, note_id, due, is_reversed, parent_card_id, extra_fields, card_type, front_audio, back_audio, front_image, back_image, direction) 
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [back, front, noteId, now, cardId, JSON.stringify(extraFields || {}), cardType,
        backAudio || null, frontAudio || null, backImage || null, frontImage || null, 'back-to-front']);
  }
  
  saveDatabase();
  return cardId;
});

ipcMain.handle('cards:update', (event, card) => {
  // Build update query dynamically based on what fields are provided
  const updates = [];
  const values = [];
  
  // Content fields
  if (card.front !== undefined) {
    updates.push('front = ?');
    values.push(card.front);
  }
  if (card.back !== undefined) {
    updates.push('back = ?');
    values.push(card.back);
  }
  
  // Media fields
  if (card.front_audio !== undefined) {
    updates.push('front_audio = ?');
    values.push(card.front_audio);
  }
  if (card.back_audio !== undefined) {
    updates.push('back_audio = ?');
    values.push(card.back_audio);
  }
  if (card.front_image !== undefined) {
    updates.push('front_image = ?');
    values.push(card.front_image);
  }
  if (card.back_image !== undefined) {
    updates.push('back_image = ?');
    values.push(card.back_image);
  }
  if (card.direction !== undefined) {
    updates.push('direction = ?');
    values.push(card.direction);
  }
  
  // FSRS scheduling fields
  if (card.stability !== undefined) {
    updates.push('stability = ?');
    values.push(card.stability);
  }
  if (card.difficulty !== undefined) {
    updates.push('difficulty = ?');
    values.push(card.difficulty);
  }
  if (card.reps !== undefined) {
    updates.push('reps = ?');
    values.push(card.reps);
  }
  if (card.lapses !== undefined) {
    updates.push('lapses = ?');
    values.push(card.lapses);
  }
  if (card.state !== undefined) {
    updates.push('state = ?');
    values.push(card.state);
  }
  if (card.last_review !== undefined) {
    updates.push('last_review = ?');
    values.push(card.last_review);
  }
  if (card.due !== undefined) {
    updates.push('due = ?');
    values.push(card.due);
  }
  if (card.buried_until !== undefined) {
    updates.push('buried_until = ?');
    values.push(card.buried_until);
  }
  
  if (updates.length === 0) {
    return false; // Nothing to update
  }
  
  values.push(card.id);
  
  const query = `UPDATE cards SET ${updates.join(', ')} WHERE id = ?`;
  db.run(query, values);
  saveDatabase();
  return true;
});

ipcMain.handle('cards:delete', (event, id) => {
  const result = db.exec('SELECT id FROM cards WHERE parent_card_id = ?', [id]);
  if (result[0] && result[0].values.length > 0) {
    db.run('DELETE FROM cards WHERE id = ?', [result[0].values[0][0]]);
  }
  db.run('DELETE FROM cards WHERE id = ?', [id]);
  saveDatabase();
  return true;
});

// Media handling
ipcMain.handle('media:add', async (event, { noteId, mediaType }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: mediaType === 'image' 
      ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
      : [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
  });
  
  if (result.canceled) return null;
  
  const sourcePath = result.filePaths[0];
  const filename = path.basename(sourcePath);
  const mediaDir = path.join(app.getPath('userData'), 'media');
  
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }
  
  const destPath = path.join(mediaDir, `${Date.now()}_${filename}`);
  fs.copyFileSync(sourcePath, destPath);
  
  const stats = fs.statSync(destPath);
  const now = new Date().toISOString();
  
  db.run(`
    INSERT INTO media (filename, filepath, media_type, mime_type, size, created_at, note_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [filename, destPath, mediaType, path.extname(filename), stats.size, now, noteId]);
  
  const dbResult = db.exec('SELECT last_insert_rowid()');
  saveDatabase();
  
  return {
    id: dbResult[0].values[0][0],
    filename,
    filepath: destPath,
    mediaType
  };
});

ipcMain.handle('media:getByNote', (event, noteId) => {
  const result = db.exec('SELECT * FROM media WHERE note_id = ?', [noteId]);
  return result[0] ? result[0].values.map(row => ({
    id: row[0], filename: row[1], filepath: row[2], media_type: row[3],
    mime_type: row[4], size: row[5], created_at: row[6], note_id: row[7]
  })) : [];
});

ipcMain.handle('media:uploadImage', async (event, { noteId, imageData, fieldId }) => {
  try {
    const mediaDir = path.join(app.getPath('userData'), 'media');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    const fileName = `image_${Date.now()}_${fieldId || 'unknown'}.png`;
    const filePath = path.join(mediaDir, fileName);
    
    // imageData should be base64
    if (typeof imageData === 'string') {
      // Base64
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, base64Data, 'base64');
    } else {
      // Buffer
      fs.writeFileSync(filePath, imageData);
    }
    
    // Save to media table
    const now = new Date().toISOString();
    db.run(`
      INSERT INTO media (filename, filepath, media_type, created_at, note_id)
      VALUES (?, ?, ?, ?, ?)
    `, [fileName, filePath, 'image', now, noteId]);
    
    saveDatabase();
    return filePath;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
});

ipcMain.handle('media:delete', (event, id) => {
  const result = db.exec('SELECT filepath FROM media WHERE id = ?', [id]);
  if (result[0] && result[0].values.length > 0) {
    const filepath = result[0].values[0][0];
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
  db.run('DELETE FROM media WHERE id = ?', [id]);
  saveDatabase();
  return true;
});

// Forvo scraper (no API key needed) - similar to Anki Simple Forvo Audio plugin
// Handler to get all pronunciations without downloading
ipcMain.handle('audio:listForvoPronunciations', async (event, { word, language }) => {
  // This will reuse the scraping logic from fetchFromForvo
  // We'll modify fetchFromForvo to support a "listOnly" mode
  try {
    const result = await fetchFromForvoInternal(word, language, null, true);
    console.log('listForvoPronunciations result:', result);
    // Return the pronunciations array directly
    return result?.pronunciations || [];
  } catch (error) {
    console.error('listForvoPronunciations error:', error);
    throw error;
  }
});

// Handler to download a specific pronunciation
ipcMain.handle('audio:downloadForvoPronunciation', async (event, { word, language, pronunciationUrl }) => {
  return await fetchFromForvoInternal(word, language, pronunciationUrl, false);
});

// Internal function that handles both listing and downloading
async function fetchFromForvoInternal(word, language, pronunciationUrl = null, listOnly = false) {
  try {
    const cheerio = require('cheerio');
    
    // Use Node's built-in fetch (Node 18+)
    const fetch = globalThis.fetch;
    if (!fetch) {
      throw new Error('Fetch is not available. Please use Node.js 18+ or install node-fetch.');
    }
    
    // Realistic browser headers to avoid 403 errors
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    };
    
    // Helper function to fetch using hidden browser window (bypasses bot detection)
    // This uses Electron's real browser engine, which should bypass most bot detection
    const fetchWithBrowser = async (url) => {
      return new Promise((resolve, reject) => {
        const hiddenWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
          }
        });
        
        let pageLoaded = false;
        let loadTimeout;
        const audioUrls = new Set(); // Track audio URLs from network requests
        
        // Intercept network requests AND responses to capture audio URLs
        hiddenWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
          const requestUrl = details.url;
          // Capture any .mp3 requests or Forvo audio CDN requests
          if (requestUrl.includes('.mp3') || requestUrl.match(/audio\d+\.forvo\.com/)) {
            audioUrls.add(requestUrl);
            console.log('Captured audio URL from request:', requestUrl);
          }
          callback({});
        });
        
        // Also intercept responses to catch URLs in response bodies
        hiddenWindow.webContents.session.webRequest.onCompleted((details) => {
          const responseUrl = details.url;
          // Only log actual Forvo API calls, not ad networks or other third-party requests
          if (responseUrl.includes('forvo.com') && 
              (responseUrl.includes('/api/') || 
               responseUrl.includes('/action/') || 
               responseUrl.match(/forvo\.com\/[^\/]+\/pronunciation/))) {
            console.log('Forvo API response received:', responseUrl);
          }
        });
        
        // Filter out third-party resource failures (ads, trackers, etc.)
        hiddenWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          // Only reject if it's the main frame that failed
          if (isMainFrame && !pageLoaded) {
            clearTimeout(loadTimeout);
            hiddenWindow.close();
            reject(new Error(`Failed to load page: ${errorDescription} (${errorCode})`));
          }
          // Ignore sub-resource failures (ads, trackers, etc.)
        });
        
        // Inject fetch/XHR interceptors as early as possible
        hiddenWindow.webContents.once('dom-ready', () => {
          hiddenWindow.webContents.executeJavaScript(`
            (function() {
              // Override fetch to capture audio URLs
              const originalFetch = window.fetch;
              window.fetch = function(...args) {
                const url = args[0];
                if (typeof url === 'string' && (url.includes('.mp3') || url.includes('audio') || url.match(/audio\\d+\\.forvo\\.com/))) {
                  console.log('Fetch intercepted:', url);
                  if (url.includes('.mp3') || url.match(/audio\\d+\\.forvo\\.com/)) {
                    window.__capturedAudioUrls = window.__capturedAudioUrls || [];
                    window.__capturedAudioUrls.push(url);
                  }
                }
                return originalFetch.apply(this, args);
              };
              
              // Override XMLHttpRequest
              const originalOpen = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                if (typeof url === 'string' && (url.includes('.mp3') || url.includes('audio') || url.match(/audio\\d+\\.forvo\\.com/))) {
                  console.log('XHR intercepted:', url);
                  if (url.includes('.mp3') || url.match(/audio\\d+\\.forvo\\.com/)) {
                    window.__capturedAudioUrls = window.__capturedAudioUrls || [];
                    window.__capturedAudioUrls.push(url);
                  }
                }
                return originalOpen.apply(this, [method, url, ...rest]);
              };
            })();
          `).catch(err => console.log('Failed to inject fetch/XHR interceptors:', err));
        });
        
        hiddenWindow.webContents.once('did-finish-load', async () => {
          if (pageLoaded) return; // Prevent double execution
          pageLoaded = true;
          clearTimeout(loadTimeout);
          
          try {
            // Wait for page to be fully loaded and dynamic content to appear
            // Check if language containers are present, wait up to 10 seconds
            let containersFound = false;
            for (let attempt = 0; attempt < 10; attempt++) {
              const hasContainers = await hiddenWindow.webContents.executeJavaScript(`
                document.querySelectorAll('div[id^="language-container-"]').length > 0
              `).catch(() => false);
              
              if (hasContainers) {
                containersFound = true;
                console.log('Language containers found after', (attempt + 1) * 1000, 'ms');
                break;
              }
              
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (!containersFound) {
              console.log('Warning: Language containers not found after 10 seconds, proceeding anyway');
            }
            
            // Additional wait for JavaScript to fully execute
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Extract pronunciation data using the Anki plugin's approach
            // Find elements with id^='play_' and extract base64-encoded URLs from onclick handlers
            let extractedData = null;
            try {
              extractedData = await hiddenWindow.webContents.executeJavaScript(`
                (function() {
                  const results = [];
                  
                  // Find the language container for the specific language
                  const languageCode = '${language}';
                  let languageContainer = document.querySelector('div#language-container-' + languageCode);
                  
                  // If specific language not found, try to find all language containers and log them
                  if (!languageContainer) {
                    console.log('Language container not found for:', languageCode);
                    const allContainers = document.querySelectorAll('div[id^="language-container-"]');
                    const availableLanguages = [];
                    allContainers.forEach(container => {
                      const id = container.id;
                      if (id) {
                        const langCode = id.replace('language-container-', '');
                        availableLanguages.push(langCode);
                      }
                    });
                    console.log('Available language containers:', availableLanguages.join(', '));
                    
                    // If no containers found at all, the page might not be loaded yet
                    if (allContainers.length === 0) {
                      console.log('No language containers found at all - page might not be fully loaded');
                      return null;
                    }
                    
                    // Try all available containers to extract pronunciations from any language
                    if (allContainers.length > 0) {
                      console.log('Trying all available language containers:', availableLanguages.join(', '));
                      // We'll process all containers below
                    } else {
                      return null;
                    }
                  }
                  
                  // Process the specific language container or all containers if not found
                  const containersToProcess = languageContainer ? [languageContainer] : document.querySelectorAll('div[id^="language-container-"]');
                  
                  containersToProcess.forEach((container, containerIdx) => {
                    const containerId = container.id || 'unknown';
                    console.log('Processing container', containerIdx + 1, 'of', containersToProcess.length, ':', containerId);
                    
                    // Find all play buttons (divs with id starting with 'play_')
                    const playDivs = container.querySelectorAll('div[id^="play_"]');
                    console.log('Found', playDivs.length, 'play buttons in', containerId);
                    
                    // Try both playDivs and any divs with onclick handlers
                    const divsToCheck = playDivs.length > 0 ? playDivs : container.querySelectorAll('div[onclick*="Play"], div[onclick*="play"], [onclick*="Play"]');
                    
                    if (divsToCheck.length === 0) {
                      console.log('No play divs found in', containerId);
                      return; // Skip this container
                    }
                    
                    console.log('Checking', divsToCheck.length, 'divs for onclick handlers in', containerId);
                    
                    divsToCheck.forEach(div => {
                    const onclick = div.getAttribute('onclick') || '';
                    
                    if (!onclick) {
                      return; // Skip if no onclick
                    }
                    
                    // Forvo's Play() function format:
                    // Play(6166435,'OTg4MTIyMC8xMzgvOTg4MTIyMF8xMzhfMzM5MDIxLm1wMw==','OTg4MTIyMC8xMzgvOTg4MTIyMF8xMzhfMzM5MDIxLm9nZw==',false,'...','...','h');
                    // The 3rd parameter (index 2) is the base64-encoded OGG URL
                    if (onclick.includes('Play(')) {
                      console.log('Found Play() handler:', onclick.substring(0, 100));
                      try {
                        // Extract the parameters from the Play() function
                        const match = onclick.match(/Play\\(([^)]+)\\)/);
                        if (match && match[1]) {
                          // Split by comma, but be careful with quoted strings
                          const params = [];
                          let current = '';
                          let inQuotes = false;
                          let quoteChar = '';
                          
                          for (let i = 0; i < match[1].length; i++) {
                            const char = match[1][i];
                            if ((char === '"' || char === "'") && (i === 0 || match[1][i-1] !== '\\\\')) {
                              if (!inQuotes) {
                                inQuotes = true;
                                quoteChar = char;
                              } else if (char === quoteChar) {
                                inQuotes = false;
                                quoteChar = '';
                              }
                              current += char;
                            } else if (char === ',' && !inQuotes) {
                              params.push(current.trim());
                              current = '';
                            } else {
                              current += char;
                            }
                          }
                          if (current.trim()) {
                            params.push(current.trim());
                          }
                          
                          // The 3rd parameter (index 2) is the base64-encoded OGG URL
                          if (params.length > 2) {
                            let base64Audio = params[2];
                            // Remove quotes
                            base64Audio = base64Audio.replace(/^['"]|['"]$/g, '');
                            
                            // Decode base64
                            try {
                              const decodedLink = atob(base64Audio);
                              const audioUrl = 'https://audio00.forvo.com/ogg/' + decodedLink;
                              
                              // Get username if available
                              const usernameEl = div.closest('li')?.querySelector('.username, .by, [class*="user"]');
                              const username = usernameEl ? usernameEl.textContent.trim() : 'Forvo';
                              
                              // Get rating if available
                              const rateEl = div.closest('li')?.querySelector('[class*="rate"], [class*="rating"]');
                              const rate = rateEl ? parseInt(rateEl.textContent || '0', 10) : 0;
                              
                              // Get language code from container ID
                              const containerId = container.id || '';
                              const langCode = containerId.replace('language-container-', '') || languageCode;
                              
                              results.push({
                                pathmp3: audioUrl,
                                username: username,
                                rate: rate,
                                languageCode: langCode
                              });
                              
                              console.log('Extracted audio URL:', audioUrl);
                            } catch (decodeError) {
                              console.log('Failed to decode base64:', decodeError);
                            }
                          }
                        }
                      } catch (parseError) {
                        console.log('Failed to parse onclick:', parseError);
                      }
                    }
                  }); // End divsToCheck.forEach
                  }); // End containersToProcess.forEach
                  
                  if (results.length === 0) {
                    console.log('No pronunciations extracted from onclick handlers');
                    // Fallback: try to find any audio URLs in the page
                    const pageHtml = document.documentElement.outerHTML;
                    const forvoAudioPattern = /https?:\\/\\/audio\\d+\\.forvo\\.com\\/[^"'\s<>]+/g;
                    const forvoMatches = pageHtml.match(forvoAudioPattern);
                    if (forvoMatches) {
                      forvoMatches.forEach(url => {
                        results.push({
                          pathmp3: url,
                          username: 'Forvo',
                          rate: 0
                        });
                      });
                    }
                  }
                  
                  return results.length > 0 ? results : null;
                })()
              `).catch((err) => {
                console.log('JavaScript extraction error:', err);
                return null;
              });
              
              // Check for URLs captured by injected fetch/XHR interceptors
              const capturedUrls = await hiddenWindow.webContents.executeJavaScript(`
                window.__capturedAudioUrls || []
              `).catch(() => []);
              
              if (capturedUrls && capturedUrls.length > 0) {
                console.log(`Found ${capturedUrls.length} audio URLs from fetch/XHR interception`);
                capturedUrls.forEach(url => audioUrls.add(url));
              }
              
              // Also check if we captured any audio URLs from network requests
              if (audioUrls.size > 0) {
                console.log(`Total audio URLs from network: ${audioUrls.size}`);
                const networkUrls = Array.from(audioUrls).map(url => ({
                  pathmp3: url,
                  username: 'Forvo',
                  rate: 0
                }));
                // Combine with extracted data or use network URLs
                if (extractedData && Array.isArray(extractedData)) {
                  extractedData.push(...networkUrls);
                } else {
                  extractedData = networkUrls;
                }
              }
              
              if (extractedData && Array.isArray(extractedData) && extractedData.length > 0) {
                // We got data from JavaScript execution, return it as a special marker
                hiddenWindow.close();
                resolve({ __extractedData: extractedData });
                return;
              }
            } catch (jsError) {
              console.log('JavaScript extraction failed, falling back to HTML:', jsError.message);
            }
            
            // Check network URLs even if JavaScript extraction failed
            if (audioUrls.size > 0) {
              console.log(`Found ${audioUrls.size} audio URLs from network interception`);
              const networkUrls = Array.from(audioUrls).map(url => ({
                pathmp3: url,
                username: 'Forvo',
                rate: 0
              }));
              hiddenWindow.close();
              resolve({ __extractedData: networkUrls });
              return;
            } else {
              console.log('No audio URLs captured from network requests');
            }
            
            // Fallback: Get HTML if JavaScript extraction didn't work
            const html = await hiddenWindow.webContents.executeJavaScript(`
              document.documentElement.outerHTML
            `);
            
            hiddenWindow.close();
            resolve(html);
          } catch (error) {
            hiddenWindow.close();
            reject(new Error(`Failed to extract HTML: ${error.message}`));
          }
        });
        
        hiddenWindow.loadURL(url);
        
        // Timeout after 20 seconds
        loadTimeout = setTimeout(() => {
          if (!hiddenWindow.isDestroyed() && !pageLoaded) {
            hiddenWindow.close();
            reject(new Error('Request timeout - page took too long to load'));
          }
        }, 20000);
      });
    };
    
    let pronunciations = [];
    
    // Method 1: Try Forvo's API endpoint first (sometimes works without auth)
    try {
      const apiUrl = `https://apifree.forvo.com/action/word-pronunciations/word/${encodeURIComponent(word)}/language/${language}/format/json`;
      console.log(`Trying Forvo API: ${apiUrl}`);
      
      const apiResponse = await fetch(apiUrl, {
        headers: {
          'User-Agent': browserHeaders['User-Agent'],
          'Accept': 'application/json'
        }
      });
      
      if (apiResponse.ok) {
        const apiData = await apiResponse.json();
        if (apiData.items && apiData.items.length > 0) {
          pronunciations = apiData.items.map(item => ({
            pathmp3: item.pathmp3,
            username: item.username,
            rate: item.rate || 0
          }));
          console.log(`Found ${pronunciations.length} pronunciations via API`);
        }
      } else {
        console.log(`API returned ${apiResponse.status}, trying web scraping...`);
      }
    } catch (apiError) {
      console.log('API method failed, trying web scraping:', apiError.message);
    }
    
    // Method 2: Scrape Forvo word page if API didn't work
    if (pronunciations.length === 0) {
      // Forvo URL format: https://forvo.com/word/{word}/#/{language}
      const forvoUrl = `https://forvo.com/word/${encodeURIComponent(word)}/#/${language}`;
      console.log(`Fetching Forvo page: ${forvoUrl}`);
      
      let html;
      let $;
      
      try {
        // First try regular fetch
        const response = await fetch(forvoUrl, {
          headers: browserHeaders
        });
        
        if (!response.ok) {
          // If we get 403, use hidden browser window (bypasses bot detection)
          if (response.status === 403) {
            console.log('403 error, trying with hidden browser window...');
            try {
              const browserResult = await fetchWithBrowser(forvoUrl);
              if (browserResult && browserResult.__extractedData) {
                pronunciations = browserResult.__extractedData;
              } else if (browserResult && typeof browserResult === 'string') {
                html = browserResult;
                $ = cheerio.load(html);
              }
            } catch (browserError) {
              // Try alternative URL without hash
              const altUrl = `https://forvo.com/word/${encodeURIComponent(word)}/`;
              console.log(`Trying alternative URL: ${altUrl}`);
              const browserResult = await fetchWithBrowser(altUrl);
              if (browserResult && browserResult.__extractedData) {
                pronunciations = browserResult.__extractedData;
              } else if (browserResult && typeof browserResult === 'string') {
                html = browserResult;
                $ = cheerio.load(html);
              }
            }
          } else {
            throw new Error(`Failed to fetch Forvo page: ${response.status} ${response.statusText}`);
          }
        } else {
          html = await response.text();
          $ = cheerio.load(html);
        }
      } catch (fetchError) {
        // If regular fetch fails, try browser window
        console.log('Regular fetch failed, trying with hidden browser window...');
        try {
          const browserResult = await fetchWithBrowser(forvoUrl);
          // Check if we got extracted data directly from JavaScript
          if (browserResult && browserResult.__extractedData) {
            pronunciations = browserResult.__extractedData;
          } else if (browserResult && typeof browserResult === 'string') {
            html = browserResult;
            $ = cheerio.load(html);
          }
        } catch (browserError) {
          // Try alternative URL
          const altUrl = `https://forvo.com/word/${encodeURIComponent(word)}/`;
          try {
            const browserResult = await fetchWithBrowser(altUrl);
            if (browserResult && browserResult.__extractedData) {
              pronunciations = browserResult.__extractedData;
            } else if (browserResult && typeof browserResult === 'string') {
              html = browserResult;
              $ = cheerio.load(html);
            }
          } catch (altError) {
            console.log('Alternative URL also failed:', altError.message);
          }
        }
      }
      
      // If we already got pronunciations from JavaScript extraction, skip HTML parsing
      if (pronunciations.length > 0) {
        console.log(`Found ${pronunciations.length} pronunciations via JavaScript extraction`);
      } else if (html && $) {
        // Look for embedded JSON data in script tags
        $('script').each((i, elem) => {
          const scriptContent = $(elem).html();
          if (scriptContent) {
            // Try multiple patterns for pronunciation data
            try {
              // Pattern 1: Look for pronunciations array
              const pronunciationsMatch = scriptContent.match(/"pronunciations"\s*:\s*\[(.*?)\]/s);
              if (pronunciationsMatch) {
                const fullMatch = scriptContent.match(/\{.*"pronunciations"\s*:\s*\[.*?\].*\}/s);
                if (fullMatch) {
                  const data = JSON.parse(fullMatch[0]);
                  if (data.pronunciations && Array.isArray(data.pronunciations)) {
                    pronunciations = data.pronunciations;
                  }
                }
              }
              
              // Pattern 2: Look for pathmp3 URLs directly
              if (pronunciations.length === 0 && scriptContent.includes('pathmp3')) {
                const pathmp3Matches = scriptContent.match(/https?:\/\/[^"'\s]*pathmp3[^"'\s]*/g);
                if (pathmp3Matches) {
                  pronunciations = pathmp3Matches.map(url => ({
                    pathmp3: url,
                    username: 'Forvo',
                    rate: 0
                  }));
                }
              }
              
              // Pattern 3: Look for any audio URLs in script
              if (pronunciations.length === 0) {
                const audioMatches = scriptContent.match(/https?:\/\/[^"'\s]+\.mp3/g);
                if (audioMatches) {
                  pronunciations = audioMatches.map(url => ({
                    pathmp3: url,
                    username: 'Forvo',
                    rate: 0
                  }));
                }
              }
            } catch (e) {
              // Not JSON, continue
            }
          }
        });
        
        // Extract from HTML using Anki plugin's approach
        // Find language container and extract base64-encoded URLs from onclick handlers
        if (pronunciations.length === 0) {
          try {
            // Find the language container
            let languageContainer = $(`div#language-container-${language}`);
            
            // Debug: Log what language containers are available
            const allContainers = $('div[id^="language-container-"]');
            const availableLanguages = [];
            allContainers.each((i, elem) => {
              const id = $(elem).attr('id');
              if (id) {
                const langCode = id.replace('language-container-', '');
                availableLanguages.push(langCode);
              }
            });
            
            if (languageContainer.length === 0) {
              if (availableLanguages.length > 0) {
                console.log(`Language container for "${language}" not found. Available languages: ${availableLanguages.join(', ')}`);
                console.log('Trying all available language containers');
              } else {
                console.log('No language containers found in HTML');
              }
            }
            
            // Process the specific language container or all containers if not found
            const containersToProcess = languageContainer.length > 0 ? languageContainer : allContainers;
            
            containersToProcess.each((containerIdx, containerElem) => {
              const $container = $(containerElem);
              const containerId = $container.attr('id') || 'unknown';
              
              // Remove noise (phrase pronunciations, extra info)
              // Remove phrase pronunciations for any language in this container
              $container.find('ul[id^="phrase-pronunciations-list-"]').remove();
              $container.find('div.extra-info-container').remove();
              
              // Find all play buttons (divs with id starting with 'play_')
              let playDivs = $container.find('div[id^="play_"]');
              
              // If no play divs found, try finding any divs with onclick handlers
              if (playDivs.length === 0) {
                playDivs = $container.find('div[onclick*="Play"], div[onclick*="play"], [onclick*="Play"]');
              }
              
              console.log(`Found ${playDivs.length} play buttons in ${containerId}`);
              
              playDivs.each((i, elem) => {
                const $div = $(elem);
                const onclick = $div.attr('onclick') || '';
                
                // Parse Play() function: Play(id,'mp3_base64','ogg_base64',...)
                // The 3rd parameter (index 2) is the base64-encoded OGG URL
                if (onclick.includes('Play(')) {
                  try {
                    const match = onclick.match(/Play\(([^)]+)\)/);
                    if (match && match[1]) {
                      // Split parameters, handling quoted strings
                      const params = [];
                      let current = '';
                      let inQuotes = false;
                      let quoteChar = '';
                      
                      for (let j = 0; j < match[1].length; j++) {
                        const char = match[1][j];
                        if ((char === '"' || char === "'") && (j === 0 || match[1][j-1] !== '\\\\')) {
                          if (!inQuotes) {
                            inQuotes = true;
                            quoteChar = char;
                          } else if (char === quoteChar) {
                            inQuotes = false;
                            quoteChar = '';
                          }
                          current += char;
                        } else if (char === ',' && !inQuotes) {
                          params.push(current.trim());
                          current = '';
                        } else {
                          current += char;
                        }
                      }
                      if (current.trim()) {
                        params.push(current.trim());
                      }
                      
                      // Get the 3rd parameter (index 2) - base64-encoded OGG URL
                      if (params.length > 2) {
                        let base64Audio = params[2];
                        // Remove quotes
                        base64Audio = base64Audio.replace(/^['"]|['"]$/g, '');
                        
                        // Decode base64
                        try {
                          const decodedLink = Buffer.from(base64Audio, 'base64').toString('ascii');
                          const audioUrl = `https://audio00.forvo.com/ogg/${decodedLink}`;
                          
                          // Get username
                          const $li = $div.closest('li');
                          const username = $li.find('.username, .by, [class*="user"]').first().text().trim() || 'Forvo';
                          
                          // Get rating
                          const rate = parseInt($li.find('[class*="rate"], [class*="rating"]').first().text() || '0', 10);
                          
                          // Get language code from container
                          const langCode = containerId.replace('language-container-', '') || language;
                          
                          pronunciations.push({
                            pathmp3: audioUrl,
                            username: username,
                            rate: rate,
                            languageCode: langCode
                          });
                        } catch (decodeError) {
                          console.log('Failed to decode base64:', decodeError);
                        }
                      }
                    }
                  } catch (parseError) {
                    console.log('Failed to parse onclick:', parseError);
                  }
                }
              }); // End playDivs.each
            }); // End containersToProcess.each
            
            if (pronunciations.length > 0) {
              console.log(`Extracted ${pronunciations.length} pronunciations from HTML`);
            }
          } catch (error) {
            console.log('Error extracting from HTML:', error);
          }
        }
        
        // Try to extract from page's JavaScript variables
        if (pronunciations.length === 0 && html && typeof html === 'string') {
          // Look for window.__INITIAL_STATE__ or similar
          const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/s);
          if (stateMatch) {
            try {
              const state = JSON.parse(stateMatch[1]);
              if (state.pronunciations) {
                pronunciations = state.pronunciations;
              }
            } catch (e) {
              // Not valid JSON
            }
          }
        }
        
        // Try Forvo's CDN pattern (based on Anki plugin approach)
        if (pronunciations.length === 0 && html && typeof html === 'string') {
          // Try to find any audio URLs in the raw HTML (not just .mp3, also look for audio domains)
          const audioUrlPatterns = [
            /https?:\/\/[^"'\s]+\.mp3/gi,
            /https?:\/\/audio\d+\.forvo\.com\/[^"'\s]+/gi,
            /https?:\/\/[^"'\s]*forvo[^"'\s]*audio[^"'\s]*/gi,
            /"pathmp3"\s*:\s*"([^"]+)"/gi
          ];
          
          for (const pattern of audioUrlPatterns) {
            const matches = html.match(pattern);
            if (matches && matches.length > 0) {
              pronunciations = matches.map(url => {
                // Clean up the URL if it's from a JSON match
                const cleanUrl = url.replace(/^"pathmp3"\s*:\s*"/, '').replace(/"$/, '');
                return {
                  pathmp3: cleanUrl.startsWith('http') ? cleanUrl : `https://forvo.com${cleanUrl}`,
                  username: 'Forvo',
                  rate: 0
                };
              }).filter((item, index, self) => 
                // Remove duplicates
                index === self.findIndex(p => p.pathmp3 === item.pathmp3)
              );
              
              if (pronunciations.length > 0) break;
            }
          }
        }
        
        // Debug: log what we found
        if (pronunciations.length === 0) {
          console.log('No pronunciations found. HTML length:', html ? html.length : 0);
          if ($) {
            console.log('Checking for common Forvo selectors...');
            const hasPronunciationsDiv = $('.pronunciations, [class*="pronunciation"]').length > 0;
            const hasAudioElements = $('audio, source').length > 0;
            console.log('Has pronunciations div:', hasPronunciationsDiv);
            console.log('Has audio elements:', hasAudioElements);
          }
        } else {
          console.log(`Found ${pronunciations.length} pronunciations`);
        }
      }
    }
    
    if (pronunciations.length === 0) {
      // Try to get available languages for better error message
      let availableLanguagesMsg = '';
      if (html && typeof html === 'string') {
        try {
          const $ = cheerio.load(html);
          const allContainers = $('div[id^="language-container-"]');
          const availableLanguages = [];
          allContainers.each((i, elem) => {
            const id = $(elem).attr('id');
            if (id) {
              const langCode = id.replace('language-container-', '');
              availableLanguages.push(langCode);
            }
          });
          if (availableLanguages.length > 0) {
            availableLanguagesMsg = ` Available languages for this word: ${availableLanguages.join(', ')}.`;
          }
        } catch (e) {
          // Ignore errors in error message generation
        }
      }
      throw new Error(`No pronunciations found for "${word}" in language "${language}".${availableLanguagesMsg} The word might not exist on Forvo, or pronunciations might be available in other languages.`);
    }
    
    // If listOnly, return all pronunciations
    if (listOnly) {
      return {
        pronunciations: pronunciations.map(p => ({
          url: p.pathmp3,
          username: p.username || 'Forvo',
          rate: p.rate || 0,
          languageCode: p.languageCode || language
        }))
      };
    }
    
    // Select pronunciation: use provided URL, or get the highest rated
    let selectedPronunciation;
    if (pronunciationUrl) {
      selectedPronunciation = pronunciations.find(p => p.pathmp3 === pronunciationUrl || p.pathmp3.includes(pronunciationUrl));
      if (!selectedPronunciation) {
        selectedPronunciation = pronunciations[0]; // Fallback to first
      }
    } else {
      // Get the highest rated pronunciation (or first if no ratings)
      selectedPronunciation = pronunciations.reduce((prev, current) => {
        const prevRate = prev.rate || 0;
        const currentRate = current.rate || 0;
        return currentRate > prevRate ? current : prev;
      });
    }
    
    // Ensure the URL is complete
    let audioUrl = selectedPronunciation.pathmp3;
    if (!audioUrl.startsWith('http')) {
      audioUrl = `https://forvo.com${audioUrl}`;
    }
    
    console.log(`Downloading audio from: ${audioUrl}`);
    
    // Download the audio file
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'User-Agent': browserHeaders['User-Agent'],
        'Referer': 'https://forvo.com/',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://forvo.com'
      }
    });
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    
    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Save to media directory
    const mediaDir = path.join(app.getPath('userData'), 'media');
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    const sanitizedWord = word.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `forvo_${sanitizedWord}_${language}_${Date.now()}.mp3`;
    const filepath = path.join(mediaDir, filename);
    fs.writeFileSync(filepath, buffer);
    
    console.log(`Saved Forvo audio to: ${filepath}`);
    
    // Convert filepath to a URL that the browser can use
    // Use custom protocol pkm-media:// for Electron compatibility
    const relativePath = path.relative(mediaDir, filepath);
    // Use forward slashes and encode the filename
    const encodedPath = relativePath.replace(/\\/g, '/').split('/').map(part => encodeURIComponent(part)).join('/');
    const fileUrl = `pkm-media://${encodedPath}`;
    
    console.log(`Generated file URL: ${fileUrl}`);
    
    return { 
      filepath, 
      fileUrl, // URL that can be used in audio src
      username: selectedPronunciation.username || 'Forvo', 
      rate: selectedPronunciation.rate || 0,
      url: audioUrl,
      languageCode: selectedPronunciation.languageCode || language
    };
  } catch (error) {
    console.error('Forvo scraper error:', error);
    throw new Error(`Failed to fetch Forvo audio: ${error.message}`);
  }
}

// Main handler that calls the internal function
ipcMain.handle('audio:fetchFromForvo', async (event, { word, language, pronunciationUrl }) => {
  return await fetchFromForvoInternal(word, language, pronunciationUrl, false);
});

// Stats
ipcMain.handle('stats:get', () => {
  const stats = {};
  let result = db.exec('SELECT COUNT(*) FROM notes');
  stats.notesCount = result[0].values[0][0];
  result = db.exec('SELECT COUNT(*) FROM folders');
  stats.foldersCount = result[0].values[0][0];
  result = db.exec('SELECT COUNT(*) FROM cards WHERE is_reversed = 0');
  stats.cardsCount = result[0].values[0][0];
  result = db.exec('SELECT COUNT(*) FROM cards WHERE is_reversed = 1');
  stats.reversedCount = result[0].values[0][0];
  result = db.exec('SELECT COUNT(*) FROM cards WHERE state = 0');
  stats.newCards = result[0].values[0][0];
  const now = new Date().toISOString();
  result = db.exec('SELECT COUNT(*) FROM cards WHERE due <= ?', [now]);
  stats.dueCards = result[0].values[0][0];
  result = db.exec('SELECT SUM(reps) FROM cards');
  stats.totalReviews = result[0] && result[0].values[0][0] ? result[0].values[0][0] : 0;
  result = db.exec('SELECT AVG(difficulty), AVG(stability) FROM cards WHERE reps > 0');
  stats.avgDifficulty = result[0] && result[0].values[0][0] ? result[0].values[0][0] : 0;
  stats.avgStability = result[0] && result[0].values[0][1] ? result[0].values[0][1] : 0;
  return stats;
});

ipcMain.handle('stats:getSchedule', (event, days) => {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const result = db.exec(`
    SELECT date(due) as date, COUNT(*) as count 
    FROM cards 
    WHERE due BETWEEN ? AND ? 
    GROUP BY date(due) 
    ORDER BY date
  `, [now.toISOString(), future.toISOString()]);
  return result[0] ? result[0].values.map(row => ({ date: row[0], count: row[1] })) : [];
});

ipcMain.handle('stats:getReviewHistory', (event, days) => {
  const now = new Date();
  const past = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const result = db.exec(`
    SELECT date(last_review) as date, COUNT(*) as count 
    FROM cards 
    WHERE last_review IS NOT NULL 
      AND last_review BETWEEN ? AND ?
    GROUP BY date(last_review) 
    ORDER BY date
  `, [past.toISOString(), now.toISOString()]);
  return result[0] ? result[0].values.map(row => ({ date: row[0], count: row[1] })) : [];
});

ipcMain.handle('stats:getHeatmapData', (event, daysBack, daysForward) => {
  const now = new Date();
  const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const future = new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000);
  
  // Get past reviews - extract date part from ISO string
  const historyResult = db.exec(`
    SELECT substr(last_review, 1, 10) as date, COUNT(*) as count 
    FROM cards 
    WHERE last_review IS NOT NULL 
      AND last_review >= ? 
      AND last_review <= ?
    GROUP BY substr(last_review, 1, 10)
  `, [past.toISOString(), now.toISOString()]);
  
  // Get scheduled reviews - extract date part from ISO string
  const scheduleResult = db.exec(`
    SELECT substr(due, 1, 10) as date, COUNT(*) as count 
    FROM cards 
    WHERE due >= ? 
      AND due <= ?
    GROUP BY substr(due, 1, 10)
  `, [now.toISOString(), future.toISOString()]);
  
  // Combine into a map
  const dataMap = new Map();
  
  // Add past reviews
  if (historyResult[0]) {
    historyResult[0].values.forEach(row => {
      const dateStr = row[0];
      dataMap.set(dateStr, { reviews: row[1], scheduled: 0 });
    });
  }
  
  // Add scheduled reviews
  if (scheduleResult[0]) {
    scheduleResult[0].values.forEach(row => {
      const dateStr = row[0];
      const existing = dataMap.get(dateStr) || { reviews: 0, scheduled: 0 };
      existing.scheduled = row[1];
      dataMap.set(dateStr, existing);
    });
  }
  
  // Convert to array and fill missing dates
  const result = [];
  const current = new Date(past);
  const end = new Date(future);
  
  // Reset to start of day
  current.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const data = dataMap.get(dateStr) || { reviews: 0, scheduled: 0 };
    result.push({
      date: dateStr,
      reviews: data.reviews,
      scheduled: data.scheduled
    });
    current.setDate(current.getDate() + 1);
  }
  
  return result;
});

// Settings
ipcMain.handle('settings:get', (event, key) => {
  const result = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
  return result[0] && result[0].values.length > 0 ? result[0].values[0][0] : null;
});

ipcMain.handle('settings:set', (event, { key, value }) => {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  saveDatabase();
  return true;
});

// Flashcard Templates
ipcMain.handle('templates:getAll', (event) => {
  const result = db.exec('SELECT * FROM flashcard_templates ORDER BY name ASC');
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    name: row[1],
    fields: JSON.parse(row[2]),
    create_reverse: row[3],
    created_at: row[4],
    updated_at: row[5]
  })) : [];
});

ipcMain.handle('templates:getById', (event, id) => {
  const result = db.exec('SELECT * FROM flashcard_templates WHERE id = ?', [id]);
  if (result[0] && result[0].values.length > 0) {
    const row = result[0].values[0];
    return {
      id: row[0],
      name: row[1],
      fields: JSON.parse(row[2]),
      create_reverse: row[3],
      created_at: row[4],
      updated_at: row[5]
    };
  }
  return null;
});

ipcMain.handle('templates:create', (event, { name, fields, createReverse }) => {
  const now = new Date().toISOString();
  try {
    db.run(`
      INSERT INTO flashcard_templates (name, fields, create_reverse, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `, [name, JSON.stringify(fields), createReverse ? 1 : 0, now, now]);
    
    const result = db.exec('SELECT last_insert_rowid()');
    const templateId = result[0].values[0][0];
    saveDatabase();
    return templateId;
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      throw new Error(`A template with the name "${name}" already exists.`);
    }
    throw error;
  }
});

ipcMain.handle('templates:update', (event, { id, name, fields, createReverse }) => {
  const now = new Date().toISOString();
  try {
    // Check if name is being changed and if another template with that name exists
    if (name) {
      const existing = db.exec('SELECT id FROM flashcard_templates WHERE name = ? AND id != ?', [name, id]);
      if (existing[0] && existing[0].values.length > 0) {
        throw new Error(`A template with the name "${name}" already exists.`);
      }
    }
    
    db.run(`
      UPDATE flashcard_templates
      SET name = ?, fields = ?, create_reverse = ?, updated_at = ?
      WHERE id = ?
    `, [name, JSON.stringify(fields), createReverse ? 1 : 0, now, id]);
    
    saveDatabase();
    return true;
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint')) {
      throw new Error(`A template with the name "${name}" already exists.`);
    }
    throw error;
  }
});

ipcMain.handle('templates:delete', (event, id) => {
  db.run('DELETE FROM flashcard_templates WHERE id = ?', [id]);
  saveDatabase();
  return true;
});

// Get ALL notes without any filtering (for finding hidden/orphaned notes)
ipcMain.handle('notes:getAllUnfiltered', (event) => {
  const result = db.exec(`
    SELECT DISTINCT 
      n.id,
      n.title,
      n.tags,
      n.note_type,
      n.is_flashcard_note,
      n.created_at,
      n.folder_id,
      (
        SELECT COUNT(*)
        FROM note_relationships nr
        WHERE nr.parent_note_id = n.id
      ) as child_count,
      (
        SELECT parent_note_id
        FROM note_relationships nr2
        WHERE nr2.child_note_id = n.id
        LIMIT 1
      ) as parent_note_id
    FROM notes n 
    ORDER BY n.title ASC
  `);
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    title: row[1],
    tags: row[2],
    note_type: row[3],
    is_flashcard_note: row[4],
    created_at: row[5],
    folder_id: row[6],
    child_count: row[7] || 0,
    parent_note_id: row[8] || null
  })) : [];
});

// Get ALL folders without any filtering (for finding hidden/orphaned folders)
ipcMain.handle('folders:getAllUnfiltered', (event) => {
  const result = db.exec(`
    SELECT f.*,
      (SELECT COUNT(*) FROM folders cf WHERE cf.parent_id = f.id) AS child_folder_count,
      (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS child_note_count
    FROM folders f
    ORDER BY f.name
  `);
  return result[0] ? result[0].values.map(row => ({
    id: row[0],
    name: row[1],
    parent_id: row[2],
    created_at: row[3],
    updated_at: row[4],
    child_folder_count: row[5] || 0,
    child_note_count: row[6] || 0,
    item_count: (row[5] || 0) + (row[6] || 0)
  })) : [];
});

// Fix orphaned items - move orphaned notes and folders to root
ipcMain.handle('fixOrphanedItems', (event) => {
  const now = new Date().toISOString();
  let fixedCount = 0;
  
  // Fix orphaned folders (folders with parent_id pointing to non-existent folder)
  const allFolders = db.exec('SELECT id, parent_id FROM folders');
  if (allFolders[0]) {
    const folderIds = new Set();
    for (const row of allFolders[0].values) {
      folderIds.add(row[0]);
    }
    
    for (const row of allFolders[0].values) {
      const folderId = row[0];
      const parentId = row[1];
      if (parentId !== null && !folderIds.has(parentId)) {
        // Parent doesn't exist, move to root
        db.run('UPDATE folders SET parent_id = NULL, updated_at = ? WHERE id = ?', [now, folderId]);
        fixedCount++;
      }
    }
  }
  
  // Fix orphaned note relationships (relationships where parent or child doesn't exist)
  const allNotes = db.exec('SELECT id FROM notes');
  const noteIds = new Set();
  if (allNotes[0]) {
    for (const row of allNotes[0].values) {
      noteIds.add(row[0]);
    }
  }
  
  const relationships = db.exec('SELECT id, parent_note_id, child_note_id FROM note_relationships');
  if (relationships[0]) {
    for (const row of relationships[0].values) {
      const relId = row[0];
      const parentId = row[1];
      const childId = row[2];
      
      if (!noteIds.has(parentId) || !noteIds.has(childId)) {
        // Invalid relationship, delete it
        db.run('DELETE FROM note_relationships WHERE id = ?', [relId]);
        fixedCount++;
      }
    }
  }
  
  // Fix notes with invalid folder_id
  const notesWithFolders = db.exec('SELECT id, folder_id FROM notes WHERE folder_id IS NOT NULL');
  if (notesWithFolders[0] && allFolders[0]) {
    const folderIds = new Set();
    for (const row of allFolders[0].values) {
      folderIds.add(row[0]);
    }
    
    for (const row of notesWithFolders[0].values) {
      const noteId = row[0];
      const folderId = row[1];
      if (!folderIds.has(folderId)) {
        // Folder doesn't exist, move note to root
        db.run('UPDATE notes SET folder_id = NULL, updated_at = ? WHERE id = ?', [now, noteId]);
        fixedCount++;
      }
    }
  }
  
  saveDatabase();
  return { fixedCount, message: `Fixed ${fixedCount} orphaned item(s)` };
});

// Note Templates IPC handlers
ipcMain.handle('noteTemplates:getAll', () => {
  const result = db.exec('SELECT id, name, content, description, created_at, updated_at FROM note_templates ORDER BY name ASC');
  if (result[0] && result[0].values.length > 0) {
    return result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      content: row[2],
      description: row[3] || '',
      created_at: row[4],
      updated_at: row[5]
    }));
  }
  return [];
});

ipcMain.handle('noteTemplates:getById', (event, id) => {
  const result = db.exec('SELECT id, name, content, description, created_at, updated_at FROM note_templates WHERE id = ?', [id]);
  if (result[0] && result[0].values.length > 0) {
    const row = result[0].values[0];
    return {
      id: row[0],
      name: row[1],
      content: row[2],
      description: row[3] || '',
      created_at: row[4],
      updated_at: row[5]
    };
  }
  return null;
});

ipcMain.handle('noteTemplates:create', (event, { name, content, description }) => {
  const now = new Date().toISOString();
  try {
    db.run(
      'INSERT INTO note_templates (name, content, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [name, content || '', description || '', now, now]
    );
    saveDatabase();
    const result = db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0];
  } catch (error) {
    throw new Error(`Failed to create template: ${error.message}`);
  }
});

ipcMain.handle('noteTemplates:update', (event, { id, name, content, description }) => {
  const now = new Date().toISOString();
  try {
    db.run(
      'UPDATE note_templates SET name = ?, content = ?, description = ?, updated_at = ? WHERE id = ?',
      [name, content || '', description || '', now, id]
    );
    saveDatabase();
    return true;
  } catch (error) {
    throw new Error(`Failed to update template: ${error.message}`);
  }
});

ipcMain.handle('noteTemplates:delete', (event, id) => {
  try {
    db.run('DELETE FROM note_templates WHERE id = ?', [id]);
    saveDatabase();
    return true;
  } catch (error) {
    throw new Error(`Failed to delete template: ${error.message}`);
  }
});

ipcMain.handle('noteTemplates:process', (event, { templateContent, variables }) => {
  // Process template with variable substitution
  // Variables format: {{variable_name}}
  let processed = templateContent;
  
  // Default variables
  const defaults = {
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    datetime: new Date().toLocaleString(),
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    ...variables
  };
  
  // Replace all {{variable}} patterns
  processed = processed.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return defaults[varName] !== undefined ? defaults[varName] : match;
  });
  
  return processed;
});

// Obsidian Vault Import
ipcMain.handle('obsidian:selectVault', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Obsidian Vault Folder'
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  
  return result.filePaths[0];
});

ipcMain.handle('obsidian:importVault', async (event, vaultPath) => {
  if (!vaultPath || !fs.existsSync(vaultPath)) {
    throw new Error('Invalid vault path');
  }
  
  const stats = {
    foldersCreated: 0,
    notesCreated: 0,
    notesSkipped: 0,
    errors: []
  };
  
  // Map to track folder paths to folder IDs
  const folderMap = new Map(); // path -> folderId
  folderMap.set('', null); // Root folder
  
  // Function to parse YAML frontmatter
  function parseFrontmatter(content) {
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    if (!match) {
      return { frontmatter: {}, content: content.trim() };
    }
    
    const frontmatterText = match[1];
    const bodyContent = match[2];
    
    // Simple YAML parser for common fields
    const frontmatter = {};
    const lines = frontmatterText.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Handle arrays (tags, aliases, etc.)
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        } else if (key === 'tags' && value.includes(',')) {
          value = value.split(',').map(v => v.trim());
        }
        
        frontmatter[key] = value;
      }
    }
    
    return { frontmatter, content: bodyContent.trim() };
  }
  
  // Function to extract tags from content (#tag format)
  function extractTags(content) {
    const tagRegex = /#([a-zA-Z0-9_/-]+)/g;
    const tags = new Set();
    let match;
    
    while ((match = tagRegex.exec(content)) !== null) {
      tags.add(match[1]);
    }
    
    return Array.from(tags);
  }
  
  // Function to get or create folder
  function getOrCreateFolder(folderPath, parentId) {
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath);
    }
    
    const folderName = path.basename(folderPath) || 'Root';
    const now = new Date().toISOString();
    
    try {
      db.run(`
        INSERT INTO folders (name, parent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `, [folderName, parentId, now, now]);
      
      const result = db.exec('SELECT last_insert_rowid()');
      const folderId = result[0].values[0][0];
      folderMap.set(folderPath, folderId);
      stats.foldersCreated++;
      
      return folderId;
    } catch (error) {
      console.error(`Error creating folder ${folderPath}:`, error);
      stats.errors.push(`Failed to create folder: ${folderPath}`);
      return parentId; // Return parent if creation fails
    }
  }
  
  // Recursively process directory
  function processDirectory(dirPath, parentFolderId) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // First pass: create folders
    for (const item of items) {
      if (item.isDirectory()) {
        // Skip Obsidian system folders
        if (item.name === '.obsidian' || item.name.startsWith('.')) {
          continue;
        }
        
        const itemPath = path.join(dirPath, item.name);
        const relativePath = path.relative(vaultPath, itemPath);
        const folderId = getOrCreateFolder(relativePath, parentFolderId);
        
        // Recursively process subdirectory
        processDirectory(itemPath, folderId);
      }
    }
    
    // Second pass: process markdown files
    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.md')) {
        const filePath = path.join(dirPath, item.name);
        const relativePath = path.relative(vaultPath, dirPath);
        const folderId = relativePath ? folderMap.get(relativePath) || parentFolderId : parentFolderId;
        
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const fileStats = fs.statSync(filePath);
          
          // Parse frontmatter
          const { frontmatter, content } = parseFrontmatter(fileContent);
          
          // Get title from filename (without .md) or frontmatter
          let title = frontmatter.title || path.basename(item.name, '.md');
          
          // Extract tags from content and frontmatter
          const contentTags = extractTags(content);
          let frontmatterTags = frontmatter.tags || [];
          // Ensure frontmatterTags is an array
          if (!Array.isArray(frontmatterTags)) {
            frontmatterTags = [frontmatterTags].filter(Boolean);
          }
          const allTags = [...new Set([...contentTags, ...frontmatterTags])];
          const tagsString = allTags.length > 0 ? allTags.join(',') : '';
          
          // Check if note already exists
          const existing = db.exec('SELECT id FROM notes WHERE title = ?', [title]);
          if (existing[0] && existing[0].values.length > 0) {
            stats.notesSkipped++;
            continue;
          }
          
          // Use file dates or current date
          const createdAt = frontmatter.created || fileStats.birthtime.toISOString();
          const updatedAt = frontmatter.updated || fileStats.mtime.toISOString();
          
          // Create note
          db.run(`
            INSERT INTO notes (title, content, tags, created_at, updated_at, folder_id, note_type, is_flashcard_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [title, content, tagsString, createdAt, updatedAt, folderId, 'note', 0]);
          
          const result = db.exec('SELECT last_insert_rowid()');
          const noteId = result[0].values[0][0];
          
          // Update links (wiki-links)
          updateLinks(noteId, content);
          
          stats.notesCreated++;
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
          stats.errors.push(`Failed to import: ${path.basename(filePath)}`);
        }
      }
    }
  }
  
  // Start processing from vault root
  try {
    processDirectory(vaultPath, null);
    saveDatabase();
    
    return {
      success: true,
      stats: stats,
      message: `Import complete: ${stats.notesCreated} notes created, ${stats.foldersCreated} folders created, ${stats.notesSkipped} notes skipped`
    };
  } catch (error) {
    console.error('Error importing vault:', error);
    return {
      success: false,
      stats: stats,
      message: `Import failed: ${error.message}`
    };
  }
});

app.whenReady().then(async () => {
  // Register a custom protocol to serve media files
  protocol.registerFileProtocol('pkm-media', (request, callback) => {
    try {
      const url = request.url.replace('pkm-media://', '');
      // Decode the URL-encoded path
      const decodedPath = decodeURIComponent(url);
      const mediaDir = path.join(app.getPath('userData'), 'media');
      const filePath = path.join(mediaDir, decodedPath);
      
      // Security check: ensure the file is within the media directory
      const normalizedMediaDir = path.normalize(mediaDir);
      const normalizedFilePath = path.normalize(filePath);
      
      if (!normalizedFilePath.startsWith(normalizedMediaDir)) {
        console.error('Security check failed: file path outside media directory');
        callback({ error: -6 }); // FILE_NOT_FOUND
        return;
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        callback({ error: -6 }); // FILE_NOT_FOUND
        return;
      }
      
      callback({ path: filePath });
    } catch (error) {
      console.error('Protocol handler error:', error);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
  
  await initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) saveDatabase();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (db) saveDatabase();
});
