import React, { useState, useEffect } from 'react';
import { sortByProperty } from '../utils/persian';

function NoteTreeItem({ note, level, onSelect, currentNote, expandedItems, onToggle, onDragStart, onDrop, multiSelectEnabled, selectedItems, onItemToggle, refreshKey }) {
  const [children, setChildren] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const isActive = currentNote && currentNote.id === note.id;
  const isExpanded = expandedItems.has(note.id);
  const [isDragOver, setIsDragOver] = useState(false);
  const itemKey = `note:${note.id}`;
  const isSelected = selectedItems.has(itemKey);

  useEffect(() => {
    if (isExpanded && !isLoading) {
      loadChildren();
    }
  }, [isExpanded, note.id, refreshKey]);

  const loadChildren = async () => {
    setIsLoading(true);
    try {
      const childNotes = await window.api.notes.getChildren(note.id);
      // Sort children using Persian-aware sorting
      const sortedChildren = sortByProperty(childNotes || [], 'title');
      setChildren(sortedChildren);
    } catch (error) {
      console.error('Failed to load note children:', error);
      setChildren([]);
    }
    setIsLoading(false);
  };

  const handleSelect = (event) => {
    if (event.target.closest('.tree-item-expand') || event.target.closest('.tree-item-checkbox')) {
      return;
    }
    onSelect(note, event);
  };

  const handleDragStartWrapper = (event) => {
    event.stopPropagation();
    onDragStart({ item: note, type: 'note' });
  };

  const handleDropWrapper = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    onDrop({ item: note, type: 'note' });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleCheckboxChange = (event) => {
    event.stopPropagation();
    onItemToggle('note', note, event.target.checked);
  };

  const getIcon = () => {
    // Return empty string - no icons needed
    return '';
  };

  const hasChildren = children.length > 0;
  const childBadgeCount = isExpanded ? children.length : (note.child_count || 0);
  const mayHaveChildren = (note.child_count && note.child_count > 0) || hasChildren || isExpanded || isLoading;

  return (
    <>
      <div
        className={`tree-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
        style={{ paddingLeft: `${level * 15 + 10}px` }}
        draggable
        onDragStart={handleDragStartWrapper}
        onDrop={handleDropWrapper}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleSelect}
      >
        {multiSelectEnabled && (
          <input
            type="checkbox"
            className="tree-item-checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        {mayHaveChildren && (
          <span
            className={`tree-item-expand ${isExpanded ? 'expanded' : ''}`}
            onClick={(event) => { event.stopPropagation(); onToggle(note.id); }}
          >
            ▶
          </span>
        )}
        {!mayHaveChildren && <span className="tree-item-expand"></span>}
        {getIcon() && <span className="tree-item-icon">{getIcon()}</span>}
        <span className="tree-item-label">{note.title}</span>
        {childBadgeCount > 0 && <span className="tree-item-badge">{childBadgeCount}</span>}
      </div>
      {isExpanded && (
        <div className="tree-children">
          {isLoading ? (
            <div style={{ paddingLeft: `${(level + 1) * 15 + 10}px`, fontSize: '12px', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : hasChildren ? (
            children.map((child) => (
              <NoteTreeItem
                key={child.id}
                note={child}
                level={level + 1}
                onSelect={onSelect}
                currentNote={currentNote}
                expandedItems={expandedItems}
                onToggle={onToggle}
                onDragStart={onDragStart}
                onDrop={onDrop}
                multiSelectEnabled={multiSelectEnabled}
                selectedItems={selectedItems}
                onItemToggle={onItemToggle}
                refreshKey={refreshKey}
              />
            ))
          ) : null}
        </div>
      )}
    </>
  );
}

function FolderTreeItem({ folder, level, expandedItems, onToggle, onDragStart, onDrop, onNoteSelect, currentNote, multiSelectEnabled, selectedItems, onItemToggle, refreshKey }) {
  const [childFolders, setChildFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const isExpanded = expandedItems.has(`folder-${folder.id}`);
  const [isDragOver, setIsDragOver] = useState(false);
  const itemKey = `folder:${folder.id}`;
  const isSelected = selectedItems.has(itemKey);

  useEffect(() => {
    if (isExpanded && !isLoading) {
      loadChildren();
    }
  }, [isExpanded, folder.id, refreshKey]);

  const loadChildren = async () => {
    setIsLoading(true);
    try {
      const [childFoldersData, notesData] = await Promise.all([
        window.api.folders.getByParent(folder.id),
        window.api.notes.getAll({ folderId: folder.id })
      ]);
      // Sort folders and notes using Persian-aware sorting
      const sortedFolders = sortByProperty(childFoldersData || [], 'name');
      const sortedNotes = sortByProperty(notesData || [], 'title');
      setChildFolders(sortedFolders);
      setNotes(sortedNotes);
    } catch (error) {
      console.error('Failed to load folder children:', error);
    }
    setIsLoading(false);
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    onToggle(`folder-${folder.id}`);
  };

  const handleDragStartWrapper = (event) => {
    event.stopPropagation();
    onDragStart({ item: folder, type: 'folder' });
  };

  const handleDropWrapper = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
    onDrop({ item: folder, type: 'folder' });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleCheckboxChange = (event) => {
    event.stopPropagation();
    onItemToggle('folder', folder, event.target.checked);
  };

  const childFolderCount = folder.child_folder_count || 0;
  const childNoteCount = folder.child_note_count || 0;
  const totalChildren = folder.item_count || (childFolderCount + childNoteCount);

  return (
    <>
      <div
        className={`tree-item ${isDragOver ? 'drag-over' : ''} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 15 + 10}px` }}
        draggable
        onDragStart={handleDragStartWrapper}
        onDrop={handleDropWrapper}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleToggle}
      >
        {multiSelectEnabled && (
          <input
            type="checkbox"
            className="tree-item-checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        <span
          className={`tree-item-expand ${isExpanded ? 'expanded' : ''}`}
        >
          ▶
        </span>
        {/* Folder icon removed for cleaner look */}
        <span className="tree-item-label">{folder.name}</span>
        {totalChildren > 0 && <span className="tree-item-badge">{totalChildren}</span>}
      </div>
      {isExpanded && (
        <div className="tree-children">
          {isLoading ? (
            <div style={{ paddingLeft: `${(level + 1) * 15 + 10}px`, fontSize: '12px', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : (
            <>
              {childFolders.map((child) => (
                <FolderTreeItem
                  key={child.id}
                  folder={child}
                  level={level + 1}
                  expandedItems={expandedItems}
                  onToggle={onToggle}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  onNoteSelect={onNoteSelect}
                  currentNote={currentNote}
                  multiSelectEnabled={multiSelectEnabled}
                  selectedItems={selectedItems}
                  onItemToggle={onItemToggle}
                  refreshKey={refreshKey}
                />
              ))}
              {notes.map((noteItem) => (
                <NoteTreeItem
                  key={noteItem.id}
                  note={noteItem}
                  level={level + 1}
                  onSelect={onNoteSelect}
                  currentNote={currentNote}
                  expandedItems={expandedItems}
                  onToggle={onToggle}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                  multiSelectEnabled={multiSelectEnabled}
                  selectedItems={selectedItems}
                  onItemToggle={onItemToggle}
                  refreshKey={refreshKey}
                />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Sidebar({ onNoteSelect, refreshTrigger, currentNote }) {
  const [folders, setFolders] = useState([]);
  const [rootNotes, setRootNotes] = useState([]);
  const [allNotesUnfiltered, setAllNotesUnfiltered] = useState([]);
  const [showHiddenNotes, setShowHiddenNotes] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [treeRefresh, setTreeRefresh] = useState(0);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderInputValue, setFolderInputValue] = useState('');
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [templates, setTemplates] = useState([]);

  const selectedCount = selectedItems.size;
  const isSearchMode = searchQuery.trim().length > 0;

  useEffect(() => {
    loadData();
    loadTemplates();
  }, [refreshTrigger]);
  
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showTemplateMenu && !event.target.closest('.template-menu-container')) {
        setShowTemplateMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateMenu]);
  
  const loadTemplates = async () => {
    try {
      const templatesData = await window.api.noteTemplates.getAll();
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadData = async () => {
    try {
      const [foldersData, notesData, allNotesData] = await Promise.all([
        window.api.folders.getByParent(null),
        window.api.notes.getAll({ folderId: null }),
        window.api.notes.getAllUnfiltered()
      ]);
      // Sort folders and notes using Persian-aware sorting
      const sortedFolders = sortByProperty(foldersData || [], 'name');
      const sortedNotes = sortByProperty(notesData || [], 'title');
      setFolders(sortedFolders);
      setRootNotes(sortedNotes);
      setAllNotesUnfiltered(allNotesData || []);
      setTreeRefresh((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to load sidebar data:', error);
    }
  };

  const handleSearch = async (value) => {
    setSearchQuery(value);
    if (value.trim()) {
      try {
        const results = await window.api.notes.search(value.trim());
        setSearchResults(results || []);
      } catch (error) {
        console.error('Failed to search notes:', error);
        setSearchResults([]);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleNoteTreeItemSelect = async (note, event) => {
    if (!note) return;
    const isModifier = event && (event.metaKey || event.ctrlKey);

    if (multiSelectEnabled || isModifier) {
      setSelectedItems((prev) => {
        const next = new Set(prev);
        const key = `note:${note.id}`;
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      return;
    }

    setSelectedItems(new Set([`note:${note.id}`]));
    try {
      const fullNote = await window.api.notes.getById(note.id);
      if (fullNote) {
        onNoteSelect(fullNote);
      }
    } catch (error) {
      console.error('Failed to load note:', error);
    }
  };

  const handleItemToggle = (type, item, shouldSelect) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      const key = `${type}:${item.id}`;
      if (shouldSelect) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const getSelectedFolderId = () => {
    const folderKeys = Array.from(selectedItems).filter((key) => key.startsWith('folder:'));
    if (folderKeys.length === 0) return null;
    const lastKey = folderKeys[folderKeys.length - 1];
    return Number(lastKey.split(':')[1]);
  };

  const handleNewNote = async (templateId = null) => {
    try {
      let content = '';
      let title = 'Untitled Note';
      
      // If template is provided, process it
      if (templateId) {
        const template = await window.api.noteTemplates.getById(templateId);
        if (template) {
          const processed = await window.api.noteTemplates.process({
            templateContent: template.content,
            variables: {}
          });
          content = processed;
          // Try to extract title from first line if it's a heading
          const firstLine = processed.split('\n')[0];
          if (firstLine.startsWith('# ')) {
            title = firstLine.substring(2).trim() || title;
          }
        }
      }
      
      const noteId = await window.api.notes.create({
        title,
        content,
        tags: '',
        folderId: null,
        noteType: 'note',
        isFlashcardNote: false
      });

      if (noteId) {
        await loadData();
        const note = await window.api.notes.getById(noteId);
        if (note) {
          setSelectedItems(new Set([`note:${note.id}`]));
          onNoteSelect(note);
        }
      }
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('Failed to create note: ' + (error.message || 'Unknown error'));
    }
  };

  const handleNewFlashcardNote = async () => {
    try {
      const title = 'Untitled Flashcard';
      const noteId = await window.api.notes.create({
        title,
        content: JSON.stringify({ fields: [], createReverse: false }),
        tags: 'flashcard',
        folderId: null,
        noteType: 'flashcard',
        isFlashcardNote: true
      });

      if (noteId) {
        await loadData();
        // Small delay to ensure database write is complete
        await new Promise(resolve => setTimeout(resolve, 50));
        const note = await window.api.notes.getById(noteId);
        if (note) {
          // Ensure the note has the flashcard flag
          if (!note.is_flashcard_note && note.note_type !== 'flashcard') {
            console.warn('Flashcard note created but flag not set correctly:', note);
          }
          setSelectedItems(new Set([`note:${note.id}`]));
          onNoteSelect(note);
        }
      }
    } catch (error) {
      console.error('Failed to create flashcard note:', error);
      alert('Failed to create flashcard note: ' + (error.message || 'Unknown error'));
    }
  };

  const handleNewFolder = () => {
    setFolderInputValue('');
    setShowFolderInput(true);
  };

  const handleFolderInputSubmit = async (e) => {
    e.preventDefault();
    const name = folderInputValue.trim();
    
    if (!name) {
      alert('Folder name cannot be empty');
      return;
    }

    setShowFolderInput(false);

    // Check if API exists
    if (!window.api || !window.api.folders || !window.api.folders.create) {
      console.error('API not available:', { 
        hasApi: !!window.api, 
        hasFolders: !!(window.api && window.api.folders),
        hasCreate: !!(window.api && window.api.folders && window.api.folders.create)
      });
      alert('API not available. Please restart the application.');
      return;
    }

    const parentFolderId = getSelectedFolderId();
    console.log('Creating folder:', { name, parentId: parentFolderId });

    try {
      console.log('Calling window.api.folders.create with:', { 
        name, 
        parentId: parentFolderId === null ? null : parentFolderId 
      });
      
      const folderId = await window.api.folders.create({ 
        name, 
        parentId: parentFolderId === null ? null : parentFolderId 
      });
      
      console.log('Folder created successfully, ID:', folderId, 'Type:', typeof folderId);
      
      if (folderId && folderId > 0) {
        await loadData();
        setSelectedItems(new Set([`folder:${folderId}`]));
        if (parentFolderId !== null && parentFolderId !== undefined) {
          setExpandedItems((prev) => {
            const next = new Set(prev);
            next.add(`folder-${parentFolderId}`);
            return next;
          });
        }
        console.log('Folder creation complete');
      } else {
        console.warn('Folder creation returned invalid ID:', folderId);
        alert('Folder was created but returned an invalid ID: ' + folderId);
      }
    } catch (error) {
      console.error('Failed to create folder - full error:', error);
      console.error('Error stack:', error.stack);
      alert('Failed to create folder: ' + (error.message || error.toString() || 'Unknown error'));
    }
    
    setFolderInputValue('');
  };

  const handleFolderInputCancel = () => {
    setShowFolderInput(false);
    setFolderInputValue('');
  };

  // Handle Escape key to close modal
  useEffect(() => {
    if (!showFolderInput) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowFolderInput(false);
        setFolderInputValue('');
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showFolderInput]);

  const handleToggleMultiSelect = () => {
    setMultiSelectEnabled((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedItems(new Set());
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedCount === 0) return;
    if (!confirm(`Delete ${selectedCount} selected item${selectedCount === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    try {
      for (const key of Array.from(selectedItems)) {
        const [type, idStr] = key.split(':');
        const id = Number(idStr);
        if (type === 'note') {
          await window.api.notes.delete(id);
          if (currentNote && currentNote.id === id) {
            onNoteSelect(null);
          }
        } else if (type === 'folder') {
          await window.api.folders.delete(id);
        }
      }
      setSelectedItems(new Set());
      await loadData();
    } catch (error) {
      console.error('Failed to delete items:', error);
      alert('Failed to delete items: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDragStart = (item) => {
    setDraggedItem(item);
  };

  const handleDrop = async (target) => {
    if (!draggedItem) return;

    try {
      let success = false;
      
      if (draggedItem.type === 'note' && target.type === 'folder') {
        success = await window.api.notes.move({
          noteId: draggedItem.item.id,
          folderId: target.item.id,
          parentNoteId: null
        });
      } else if (draggedItem.type === 'note' && target.type === 'note') {
        success = await window.api.notes.move({
          noteId: draggedItem.item.id,
          folderId: target.item.folder_id || null,
          parentNoteId: target.item.id
        });
      } else if (draggedItem.type === 'folder' && target.type === 'folder') {
        success = await window.api.folders.move({
          folderId: draggedItem.item.id,
          newParentId: target.item.id
        });
      }

      if (success === false) {
        alert('Failed to move item. This may be due to a circular reference or invalid operation.');
        return;
      }

      await loadData();
    } catch (error) {
      console.error('Failed to move item:', error);
      alert('Failed to move item: ' + (error.message || 'Unknown error'));
    }

    setDraggedItem(null);
  };

  const toggleExpanded = (id) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderTree = () => (
    <div className="tree-container">
      {folders.map((folder) => (
        <FolderTreeItem
          key={folder.id}
          folder={folder}
          level={0}
          expandedItems={expandedItems}
          onToggle={toggleExpanded}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onNoteSelect={handleNoteTreeItemSelect}
          currentNote={currentNote}
          multiSelectEnabled={multiSelectEnabled}
          selectedItems={selectedItems}
          onItemToggle={handleItemToggle}
          refreshKey={treeRefresh}
        />
      ))}
      {rootNotes.map((note) => (
        <NoteTreeItem
          key={note.id}
          note={note}
          level={0}
          onSelect={handleNoteTreeItemSelect}
          currentNote={currentNote}
          expandedItems={expandedItems}
          onToggle={toggleExpanded}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          multiSelectEnabled={multiSelectEnabled}
          selectedItems={selectedItems}
          onItemToggle={handleItemToggle}
          refreshKey={treeRefresh}
        />
      ))}

      {folders.length === 0 && rootNotes.length === 0 && !isSearchMode && (
        <div className="empty-state">
          <div className="empty-state-text">No notes yet</div>
          <div className="empty-state-subtext">Create your first note to get started</div>
        </div>
      )}
      
      {/* Show hidden notes section if there are notes not visible in root */}
      {!isSearchMode && allNotesUnfiltered.length > rootNotes.length && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowHiddenNotes(!showHiddenNotes)}
            style={{
              width: '100%',
              padding: '8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <span>🔍 {showHiddenNotes ? 'Hide' : 'Show'} Hidden Notes ({allNotesUnfiltered.length - rootNotes.length})</span>
            <span>{showHiddenNotes ? '▼' : '▶'}</span>
          </button>
          
          {showHiddenNotes && (
            <div style={{ paddingLeft: '8px' }}>
              {allNotesUnfiltered
                .filter(note => {
                  // Find notes that aren't in rootNotes
                  return !rootNotes.some(rootNote => rootNote.id === note.id);
                })
                .map(note => (
                  <div
                    key={note.id}
                    onClick={async () => {
                      const fullNote = await window.api.notes.getById(note.id);
                      if (fullNote) {
                        handleNoteTreeItemSelect(fullNote, {});
                      }
                    }}
                    style={{
                      padding: '6px 8px',
                      marginBottom: '2px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      background: 'transparent',
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-tertiary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    {note.title}
                    {note.folder_id && <span style={{ fontSize: '10px', marginLeft: '4px' }}>(in folder)</span>}
                    {note.parent_note_id && <span style={{ fontSize: '10px', marginLeft: '4px' }}>(child note)</span>}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderSearchResults = () => (
    <div className="sidebar-search-results">
      {searchResults.length === 0 ? (
        <div className="sidebar-search-empty">No matches found</div>
      ) : (
        searchResults.map((result) => (
          <div
            key={result.id}
            className="sidebar-search-item"
            onClick={() => handleNoteTreeItemSelect(result)}
          >
            {/* Icon removed */}
            <div>
              <div className="sidebar-search-item-title">{result.title}</div>
              {result.tags && <div className="sidebar-search-item-tags">{result.tags}</div>}
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-toolbar">
        <div style={{ position: 'relative' }} className="template-menu-container">
          <button 
            className="sidebar-toolbar-btn" 
            onClick={() => {
              if (templates.length > 0) {
                setShowTemplateMenu(!showTemplateMenu);
              } else {
                handleNewNote();
              }
            }} 
            title="New Note"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
          {showTemplateMenu && templates.length > 0 && (
            <div className="template-menu-container" style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '4px',
              minWidth: '200px',
              zIndex: 1000,
              boxShadow: 'var(--shadow-md)'
            }}>
              <div
                onClick={() => {
                  handleNewNote();
                  setShowTemplateMenu(false);
                }}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--font-size-small)',
                  color: 'var(--text-secondary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-tertiary)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                Empty Note
              </div>
              {templates.map(template => (
                <div
                  key={template.id}
                  onClick={() => {
                    handleNewNote(template.id);
                    setShowTemplateMenu(false);
                  }}
                  style={{
                    padding: '6px 10px',
                    cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--font-size-small)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                >
                  {template.name}
                  {template.description && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {template.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="sidebar-toolbar-btn" onClick={handleNewFolder} title="New Folder">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4h10v9H3zM3 4l2-2h5l2 2" />
          </svg>
        </button>
        <button className="sidebar-toolbar-btn" onClick={handleNewFlashcardNote} title="New Flashcard">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="4" width="12" height="8" rx="1" />
            <path d="M6 8h4" />
          </svg>
        </button>
        <div style={{ flex: 1 }} />
        {selectedCount > 0 && (
          <span className="sidebar-selection-info">{selectedCount} selected</span>
        )}
        <button
          className={`sidebar-toolbar-btn ${multiSelectEnabled ? 'active' : ''}`}
          onClick={handleToggleMultiSelect}
          title={multiSelectEnabled ? 'Exit multi-select' : 'Enable multi-select'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="5" height="5" />
            <rect x="9" y="2" width="5" height="5" />
            <rect x="2" y="9" width="5" height="5" />
            <rect x="9" y="9" width="5" height="5" />
          </svg>
        </button>
        <button
          className="sidebar-toolbar-btn danger"
          onClick={handleDeleteSelected}
          title="Delete selected items"
          disabled={selectedCount === 0}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4h10M6 4V3h4v1m-5 0v9a1 1 0 001 1h4a1 1 0 001-1V4" />
          </svg>
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(event) => handleSearch(event.target.value)}
        />
      </div>

      {isSearchMode ? renderSearchResults() : renderTree()}

      {showFolderInput && (
        <div className="folder-input-modal">
          <div className="folder-input-modal-content">
            <h3>New Folder</h3>
            <form onSubmit={handleFolderInputSubmit}>
              <input
                type="text"
                className="folder-input-field"
                placeholder="Folder name"
                value={folderInputValue}
                onChange={(e) => setFolderInputValue(e.target.value)}
                autoFocus
              />
              <div className="folder-input-actions">
                <button type="button" onClick={handleFolderInputCancel} className="folder-input-btn cancel">
                  Cancel
                </button>
                <button type="submit" className="folder-input-btn submit">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
