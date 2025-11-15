import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, FileText, FolderOpen, Eye, Plus, Trash2, Edit2 } from 'lucide-react';

function SettingsView({ onNoteSelect, onFolderSelect }) {
  const [requestRetention, setRequestRetention] = useState(0.9);
  const [maximumInterval, setMaximumInterval] = useState(36500);
  const [fontFamily, setFontFamily] = useState('-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif');
  const [fontSizeBase, setFontSizeBase] = useState(14);
  const [isFixingOrphans, setIsFixingOrphans] = useState(false);
  const [orphanFixResult, setOrphanFixResult] = useState(null);
  const [allNotes, setAllNotes] = useState([]);
  const [allFolders, setAllFolders] = useState([]);
  const [showAllItems, setShowAllItems] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [templates, setTemplates] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [isImportingVault, setIsImportingVault] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    loadSettings();
    loadTemplates();
  }, []);

  const handleImportObsidianVault = async () => {
    try {
      setIsImportingVault(true);
      setImportResult(null);
      
      // Select vault folder
      const vaultPath = await window.api.obsidian.selectVault();
      if (!vaultPath) {
        setIsImportingVault(false);
        return;
      }
      
      // Import vault
      const result = await window.api.obsidian.importVault(vaultPath);
      setImportResult(result);
      
      // Reload app data after import
      if (result.success) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to import Obsidian vault:', error);
      setImportResult({
        success: false,
        message: `Import failed: ${error.message || 'Unknown error'}`
      });
    } finally {
      setIsImportingVault(false);
    }
  };
  
  const loadTemplates = async () => {
    try {
      const templatesData = await window.api.noteTemplates.getAll();
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadSettings = async () => {
    const retention = await window.api.settings.get('request_retention');
    const maxInterval = await window.api.settings.get('maximum_interval');
    const savedFontFamily = await window.api.settings.get('font_family');
    const savedFontSize = await window.api.settings.get('font_size_base');
    
    if (retention) setRequestRetention(parseFloat(retention));
    if (maxInterval) setMaximumInterval(parseInt(maxInterval));
    if (savedFontFamily) setFontFamily(savedFontFamily);
    if (savedFontSize) setFontSizeBase(parseInt(savedFontSize));
    
    // Apply font settings immediately
    applyFontSettings(savedFontFamily || fontFamily, savedFontSize || fontSizeBase);
  };
  
  const applyFontSettings = (family, size) => {
    const root = document.documentElement;
    if (family) {
      root.style.setProperty('--font-family', family);
    }
    if (size) {
      root.style.setProperty('--font-size-base', `${size}px`);
      root.style.setProperty('--font-size-small', `${Math.max(10, size - 2)}px`);
      root.style.setProperty('--font-size-large', `${size + 2}px`);
    }
  };

  const handleSave = async () => {
    await window.api.settings.set({ key: 'request_retention', value: requestRetention.toString() });
    await window.api.settings.set({ key: 'maximum_interval', value: maximumInterval.toString() });
    await window.api.settings.set({ key: 'font_family', value: fontFamily });
    await window.api.settings.set({ key: 'font_size_base', value: fontSizeBase.toString() });
    
    // Apply font settings immediately
    applyFontSettings(fontFamily, fontSizeBase);
    
    alert('Settings saved!');
  };
  
  const handleFontFamilyChange = (value) => {
    setFontFamily(value);
    applyFontSettings(value, fontSizeBase);
  };
  
  const handleFontSizeChange = (value) => {
    const size = parseInt(value) || 14;
    setFontSizeBase(size);
    applyFontSettings(fontFamily, size);
  };

  const handleFixOrphanedItems = async () => {
    setIsFixingOrphans(true);
    setOrphanFixResult(null);
    try {
      const result = await window.api.maintenance.fixOrphanedItems();
      setOrphanFixResult(result);
      // Reload all items if they're being shown
      if (showAllItems) {
        await loadAllItems();
      }
      // Reload the app data by triggering a refresh
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Failed to fix orphaned items:', error);
      setOrphanFixResult({ 
        message: 'Failed to fix orphaned items: ' + (error.message || 'Unknown error') 
      });
    } finally {
      setIsFixingOrphans(false);
    }
  };

  const loadAllItems = async () => {
    setIsLoadingItems(true);
    try {
      const [notesData, foldersData] = await Promise.all([
        window.api.notes.getAllUnfiltered(),
        window.api.folders.getAllUnfiltered()
      ]);
      console.log('Loaded notes:', notesData?.length || 0, notesData);
      console.log('Loaded folders:', foldersData?.length || 0, foldersData);
      
      // Set folders first so status functions can use them
      setAllFolders(foldersData || []);
      
      // Helper function to check if note is orphaned (needs folders list)
      const isNoteOrphaned = (note, folders) => {
        if (note.folder_id !== null) {
          const folder = folders.find(f => f.id === note.folder_id);
          if (!folder) return true;
        }
        if (note.parent_note_id !== null) {
          const parent = notesData.find(n => n.id === note.parent_note_id);
          if (!parent) return true;
        }
        return false;
      };
      
      // Helper function to check if folder is orphaned
      const isFolderOrphaned = (folder, folders) => {
        if (folder.parent_id !== null) {
          const parent = folders.find(f => f.id === folder.parent_id);
          if (!parent) return true;
        }
        return false;
      };
      
      // Sort: orphaned items first, then by name
      const sortedNotes = (notesData || []).sort((a, b) => {
        const aOrphaned = isNoteOrphaned(a, foldersData || []);
        const bOrphaned = isNoteOrphaned(b, foldersData || []);
        if (aOrphaned && !bOrphaned) return -1;
        if (!aOrphaned && bOrphaned) return 1;
        return a.title.localeCompare(b.title);
      });
      
      const sortedFolders = (foldersData || []).sort((a, b) => {
        const aOrphaned = isFolderOrphaned(a, foldersData || []);
        const bOrphaned = isFolderOrphaned(b, foldersData || []);
        if (aOrphaned && !bOrphaned) return -1;
        if (!aOrphaned && bOrphaned) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setAllNotes(sortedNotes);
      setAllFolders(sortedFolders);
    } catch (error) {
      console.error('Failed to load all items:', error);
      alert('Failed to load all items: ' + (error.message || 'Unknown error') + '\n\nCheck the browser console for details.');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleShowAllItems = async () => {
    if (!showAllItems) {
      // First, try to fix orphaned items automatically
      try {
        await window.api.maintenance.fixOrphanedItems();
      } catch (error) {
        console.error('Failed to auto-fix orphaned items:', error);
      }
      await loadAllItems();
    }
    setShowAllItems(!showAllItems);
  };

  const handleNoteClick = async (note) => {
    if (onNoteSelect) {
      const fullNote = await window.api.notes.getById(note.id);
      if (fullNote) {
        onNoteSelect(fullNote);
      }
    }
  };

  const handleFolderClick = async (folder) => {
    if (onFolderSelect) {
      onFolderSelect(folder.id);
    }
  };

  const getNoteStatus = (note) => {
    const statuses = [];
    if (note.folder_id === null && note.parent_note_id === null) {
      statuses.push('Root');
    }
    if (note.folder_id !== null) {
      const folder = allFolders.find(f => f.id === note.folder_id);
      if (!folder) {
        statuses.push('⚠️ Orphaned (invalid folder)');
      } else {
        statuses.push(`📁 ${folder.name}`);
      }
    }
    if (note.parent_note_id !== null) {
      const parent = allNotes.find(n => n.id === note.parent_note_id);
      if (!parent) {
        statuses.push('⚠️ Orphaned (invalid parent)');
      } else {
        statuses.push(`🔗 Child of "${parent.title}"`);
      }
    }
    return statuses.length > 0 ? statuses.join(' • ') : 'Unknown';
  };

  const getFolderStatus = (folder) => {
    if (folder.parent_id === null) {
      return 'Root';
    }
    const parent = allFolders.find(f => f.id === folder.parent_id);
    if (!parent) {
      return '⚠️ Orphaned (invalid parent)';
    }
    return `📁 In "${parent.name}"`;
  };

  return (
    <div className="settings-view">
      <h2>Settings</h2>

      <div className="settings-section">
        <h3>Forvo Audio</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-small)' }}>
          Forvo audio fetching works without an API key. The system automatically scrapes pronunciations from Forvo, similar to the Anki Simple Forvo Audio plugin.
        </p>
      </div>

      <div className="settings-section">
        <h3>Typography</h3>
        <div className="setting-row">
          <label>Font Family:</label>
          <select
            value={fontFamily}
            onChange={(e) => handleFontFamilyChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--font-size-base)'
            }}
          >
            <option value='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'>System Default</option>
            <option value='"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'>Inter</option>
            <option value='"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif'>SF Pro Display</option>
            <option value='"Roboto", sans-serif'>Roboto</option>
            <option value='"Open Sans", sans-serif'>Open Sans</option>
            <option value='"Lato", sans-serif'>Lato</option>
            <option value='"Merriweather", serif'>Merriweather</option>
            <option value='"Georgia", serif'>Georgia</option>
            <option value='"Times New Roman", serif'>Times New Roman</option>
            <option value='"Courier New", monospace'>Courier New</option>
            <option value='"Fira Code", "Courier New", monospace'>Fira Code</option>
          </select>
        </div>
        <div className="setting-row">
          <label>Base Font Size (px):</label>
          <input
            type="number"
            min="10"
            max="24"
            value={fontSizeBase}
            onChange={(e) => handleFontSizeChange(e.target.value)}
            style={{
              width: '150px',
              padding: '8px 12px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--font-size-base)'
            }}
          />
        </div>
        <p style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', marginTop: '8px' }}>
          Changes apply immediately. Small text: {Math.max(10, fontSizeBase - 2)}px, Large text: {fontSizeBase + 2}px
        </p>
      </div>

      <div className="settings-section">
        <h3>FSRS Parameters</h3>
        <div className="setting-row">
          <label>Request Retention (0-1):</label>
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={requestRetention}
            onChange={(e) => setRequestRetention(parseFloat(e.target.value))}
          />
        </div>
        <div className="setting-row">
          <label>Maximum Interval (days):</label>
          <input
            type="number"
            min="1"
            max="36500"
            value={maximumInterval}
            onChange={(e) => setMaximumInterval(parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="settings-section">
        <h3>Note Templates</h3>
        <p style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Create markdown templates for new notes. Use <code style={{ background: 'var(--bg-tertiary)', padding: '2px 4px', borderRadius: '3px' }}>{'{{variable}}'}</code> for dynamic content. Available variables: date, time, datetime, year, month, day.
        </p>
        
        {!editingTemplate ? (
          <>
            <button
              onClick={() => {
                setEditingTemplate({ id: null, name: '', content: '', description: '' });
                setTemplateName('');
                setTemplateContent('');
                setTemplateDescription('');
              }}
              className="btn-secondary"
              style={{ marginBottom: '16px' }}
            >
              <Plus size={16} /> New Template
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map(template => (
                <div
                  key={template.id}
                  style={{
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>{template.name}</div>
                    {template.description && (
                      <div style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        {template.description}
                      </div>
                    )}
                    <div style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {template.content.substring(0, 100)}{template.content.length > 100 ? '...' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
                    <button
                      onClick={() => {
                        setEditingTemplate(template);
                        setTemplateName(template.name);
                        setTemplateContent(template.content);
                        setTemplateDescription(template.description || '');
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete template "${template.name}"?`)) {
                          await window.api.noteTemplates.delete(template.id);
                          await loadTemplates();
                        }
                      }}
                      style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        color: 'var(--error)'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  No templates yet. Create your first template to get started.
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="setting-row">
              <label>Template Name:</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Meeting Notes"
                style={{ flex: 1 }}
              />
            </div>
            <div className="setting-row">
              <label>Description (optional):</label>
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief description of this template"
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label>Template Content (Markdown):</label>
              <textarea
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                placeholder={`# {{title}}\n\nDate: {{date}}\n\n## Notes\n\n- \n\n## Action Items\n\n- `}
                rows={12}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: 'var(--font-size-small)',
                  lineHeight: '1.5',
                  resize: 'vertical'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={async () => {
                  if (!templateName.trim()) {
                    alert('Please enter a template name');
                    return;
                  }
                  if (editingTemplate.id) {
                    await window.api.noteTemplates.update({
                      id: editingTemplate.id,
                      name: templateName,
                      content: templateContent,
                      description: templateDescription
                    });
                  } else {
                    await window.api.noteTemplates.create({
                      name: templateName,
                      content: templateContent,
                      description: templateDescription
                    });
                  }
                  await loadTemplates();
                  setEditingTemplate(null);
                  setTemplateName('');
                  setTemplateContent('');
                  setTemplateDescription('');
                }}
                className="btn-primary"
              >
                <Save size={16} /> {editingTemplate.id ? 'Update' : 'Create'} Template
              </button>
              <button
                onClick={() => {
                  setEditingTemplate(null);
                  setTemplateName('');
                  setTemplateContent('');
                  setTemplateDescription('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Obsidian Import</h3>
        <p style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Import an entire Obsidian vault into the platform. This will create notes and folders matching your vault structure, preserving tags, wiki-links, and frontmatter.
        </p>
        <button 
          onClick={handleImportObsidianVault}
          className="btn-secondary"
          disabled={isImportingVault}
        >
          <FolderOpen size={18} /> 
          {isImportingVault ? 'Importing...' : 'Import Obsidian Vault'}
        </button>
        {importResult && (
          <div style={{ 
            marginTop: '12px', 
            padding: '12px', 
            background: importResult.success ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', 
            border: `1px solid ${importResult.success ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--text-primary)'
          }}>
            <div style={{ fontWeight: 500, marginBottom: '8px' }}>{importResult.message}</div>
            {importResult.stats && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                <div>Notes created: {importResult.stats.notesCreated}</div>
                <div>Folders created: {importResult.stats.foldersCreated}</div>
                {importResult.stats.notesSkipped > 0 && (
                  <div>Notes skipped (already exist): {importResult.stats.notesSkipped}</div>
                )}
                {importResult.stats.errors && importResult.stats.errors.length > 0 && (
                  <div style={{ marginTop: '8px', color: 'var(--text-warning)' }}>
                    Errors: {importResult.stats.errors.length}
                    <details style={{ marginTop: '4px' }}>
                      <summary style={{ cursor: 'pointer' }}>Show errors</summary>
                      <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                        {importResult.stats.errors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Maintenance</h3>
        <p>Fix orphaned folders and notes that may have become hidden due to invalid parent references.</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button 
            onClick={handleFixOrphanedItems}
            className="btn-secondary"
            disabled={isFixingOrphans}
          >
            <RefreshCw size={18} /> 
            {isFixingOrphans ? 'Fixing...' : 'Fix Orphaned Items'}
          </button>
          <button 
            onClick={handleShowAllItems} 
            className="btn-secondary"
            disabled={isLoadingItems}
          >
            <Eye size={18} /> 
            {showAllItems ? 'Hide' : 'Show'} All Items
          </button>
        </div>
        {orphanFixResult && (
          <div style={{ 
            marginTop: '12px', 
            padding: '8px 12px', 
            background: 'var(--bg-tertiary)', 
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--text-primary)'
          }}>
            {orphanFixResult.message}
          </div>
        )}
        {showAllItems && (
          <div style={{ marginTop: '24px' }}>
            {isLoadingItems && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading all items...
              </div>
            )}
            {!isLoadingItems && (
              <>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search notes and folders..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '14px'
                }}
              />
            </div>
            <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>
              All Notes ({itemSearchQuery ? allNotes.filter(n => 
                n.title.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                (n.tags && n.tags.toLowerCase().includes(itemSearchQuery.toLowerCase()))
              ).length : allNotes.length})
              {allNotes.filter(n => getNoteStatus(n).includes('⚠️')).length > 0 && (
                <span style={{ color: 'var(--warning)', marginLeft: '8px' }}>
                  ({allNotes.filter(n => getNoteStatus(n).includes('⚠️')).length} orphaned)
                </span>
              )}
            </h4>
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px'
            }}>
              {(() => {
                const filteredNotes = itemSearchQuery 
                  ? allNotes.filter(note => 
                      note.title.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
                      (note.tags && note.tags.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                    )
                  : allNotes;
                
                if (filteredNotes.length === 0) {
                  return (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {itemSearchQuery ? `No notes found matching "${itemSearchQuery}"` : 'No notes found'}
                    </div>
                  );
                }
                
                return filteredNotes.map(note => {
                  const status = getNoteStatus(note);
                  const isOrphaned = status.includes('⚠️');
                  return (
                    <div
                      key={note.id}
                      onClick={() => handleNoteClick(note)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '4px',
                        background: isOrphaned ? 'var(--bg-tertiary)' : 'transparent',
                        border: isOrphaned ? '1px solid var(--warning)' : '1px solid transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isOrphaned ? 'var(--bg-tertiary)' : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px' }}>{note.title}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {status}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <h4 style={{ marginTop: '24px', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>
              All Folders ({itemSearchQuery ? allFolders.filter(f => 
                f.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
              ).length : allFolders.length})
              {allFolders.filter(f => getFolderStatus(f).includes('⚠️')).length > 0 && (
                <span style={{ color: 'var(--warning)', marginLeft: '8px' }}>
                  ({allFolders.filter(f => getFolderStatus(f).includes('⚠️')).length} orphaned)
                </span>
              )}
            </h4>
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px'
            }}>
              {(() => {
                const filteredFolders = itemSearchQuery
                  ? allFolders.filter(folder => 
                      folder.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
                    )
                  : allFolders;
                
                if (filteredFolders.length === 0) {
                  return (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {itemSearchQuery ? `No folders found matching "${itemSearchQuery}"` : 'No folders found'}
                    </div>
                  );
                }
                
                return filteredFolders.map(folder => {
                  const status = getFolderStatus(folder);
                  const isOrphaned = status.includes('⚠️');
                  return (
                    <div
                      key={folder.id}
                      onClick={() => handleFolderClick(folder)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '4px',
                        background: isOrphaned ? 'var(--bg-tertiary)' : 'transparent',
                        border: isOrphaned ? '1px solid var(--warning)' : '1px solid transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isOrphaned ? 'var(--bg-tertiary)' : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FolderOpen size={16} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: '14px' }}>{folder.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {status} • {folder.item_count || 0} items
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      <button onClick={handleSave} className="btn-primary">
        <Save size={18} /> Save Settings
      </button>
    </div>
  );
}

export default SettingsView;
