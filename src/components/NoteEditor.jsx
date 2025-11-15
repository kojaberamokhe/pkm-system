import React, { useState, useEffect, useRef } from 'react';
import FlashcardNoteEditor from './FlashcardNoteEditor';
import { detectTextDirection, isPersian } from '../utils/persian';

function NoteEditor({ note, onSave, onDelete, onNoteSelect }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [backlinks, setBacklinks] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [linkPreview, setLinkPreview] = useState(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [lastSaved, setLastSaved] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [textDirection, setTextDirection] = useState('ltr');
  const [loadedNote, setLoadedNote] = useState(null);
  const contentRef = useRef(null);
  const fileInputRef = useRef(null);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (note && note.id) {
      // Always reload from database to ensure we have latest data
      const loadNote = async () => {
        try {
          const fullNote = await window.api.notes.getById(note.id);
          if (fullNote) {
            setLoadedNote(fullNote);
            setTitle(fullNote.title || '');
            setContent(fullNote.content || '');
            setTags(fullNote.tags || '');
            setIsEditing(false); // Start in preview mode
            // Detect text direction for Persian support
            const combinedText = (fullNote.title || '') + ' ' + (fullNote.content || '');
            setTextDirection(detectTextDirection(combinedText));
            loadBacklinks(fullNote.title);
          }
        } catch (error) {
          console.error('Failed to load note:', error);
          // Fallback to using provided note object
          setLoadedNote(note);
          setTitle(note.title || '');
          setContent(note.content || '');
          setTags(note.tags || '');
          setIsEditing(false); // Start in preview mode
          // Detect text direction for Persian support
          const combinedText = (note.title || '') + ' ' + (note.content || '');
          setTextDirection(detectTextDirection(combinedText));
          loadBacklinks(note.title);
        }
      };
      loadNote();
    } else {
      setLoadedNote(null);
      setTitle('');
      setContent('');
      setTags('');
      setBacklinks([]);
      setTextDirection('ltr');
      setIsEditing(true); // New notes start in edit mode
    }
  }, [note?.id]); // Only depend on note.id to avoid unnecessary re-renders

  // Auto-save effect
  useEffect(() => {
    if (!note || !note.id) return;
    
    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer for 2 seconds after last change
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(true); // true = silent save
    }, 2000);

    // Cleanup
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [title, content, tags]);

  const loadBacklinks = async (noteTitle) => {
    if (!noteTitle) return;
    try {
      const links = await window.api.notes.getBacklinks(noteTitle);
      setBacklinks(links || []);
    } catch (error) {
      console.error('Failed to load backlinks:', error);
    }
  };

  const handleSave = async (silent = false) => {
    if (!title.trim()) {
      if (!silent) alert('Please enter a title');
      return;
    }

    setIsSaving(true);
    try {
      if (note && note.id) {
        const result = await window.api.notes.update({
          id: note.id,
          title: title.trim(),
          content: content || '',
          tags: tags.trim() || '',
          folderId: note.folder_id || null,
          noteType: note.note_type || 'note',
          isFlashcardNote: false
        });
        
        if (!result) {
          throw new Error('Update returned false');
        }
      } else {
        const noteId = await window.api.notes.create({
          title: title.trim(),
          content: content || '',
          tags: tags.trim() || '',
          folderId: null,
          noteType: 'note',
          isFlashcardNote: false
        });
        
        if (!noteId) {
          throw new Error('Create returned no ID');
        }
        
        const newNote = await window.api.notes.getById(noteId);
        if (!newNote) {
          throw new Error('Failed to retrieve created note');
        }
        onNoteSelect(newNote);
      }
      setLastSaved(new Date());
      onSave();
      if (!silent) {
        // Show brief save confirmation
        const saveBtn = document.querySelector('.save-note-btn');
        if (saveBtn) {
          const originalText = saveBtn.textContent;
          saveBtn.textContent = '✓ Saved';
          setTimeout(() => {
            saveBtn.textContent = originalText;
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      if (!silent) {
        alert('Failed to save note: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!note || !note.id) return;
    
    if (confirm(`Delete "${note.title}"? This cannot be undone. This will also delete all associated flashcards and links.`)) {
      try {
        const result = await window.api.notes.delete(note.id);
        if (result) {
        onDelete();
        } else {
          throw new Error('Delete returned false');
        }
      } catch (error) {
        console.error('Failed to delete note:', error);
        alert('Failed to delete note: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  // Handle clicking links in the textarea
  const handleEditorClick = async (e) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    // Get cursor position after click
    // Use setTimeout to ensure selection is updated
    setTimeout(async () => {
    const clickPos = textarea.selectionStart;

    // Check if we're inside a [[link]]
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    let clickedLink = null;

    // Reset and search
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(content)) !== null) {
      const startPos = match.index;
      const endPos = startPos + match[0].length;
      
      if (clickPos >= startPos && clickPos <= endPos) {
        clickedLink = match[1];
        break;
      }
    }

      // If we clicked inside a link
      if (clickedLink) {
      e.preventDefault();
        e.stopPropagation();
        
      const linkedNote = await window.api.notes.getByTitle(clickedLink);
      if (linkedNote) {
        onNoteSelect(linkedNote);
      } else {
        if (confirm(`Note "${clickedLink}" doesn't exist. Create it?`)) {
          const noteId = await window.api.notes.create({
            title: clickedLink,
            content: '',
            tags: '',
            folderId: note ? note.folder_id : null,
              noteType: 'note',
              isFlashcardNote: false
          });
          const newNote = await window.api.notes.getById(noteId);
          onNoteSelect(newNote);
          onSave();
        }
      }
    }
    }, 0);
  };

  const handleLinkClick = async (event, noteTitle) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const linkedNote = await window.api.notes.getByTitle(noteTitle);
    if (linkedNote) {
      onNoteSelect(linkedNote);
    } else {
      if (confirm(`Note "${noteTitle}" doesn't exist. Create it?`)) {
        const noteId = await window.api.notes.create({
          title: noteTitle,
          content: '',
          tags: '',
          folderId: note ? note.folder_id : null,
          noteType: 'note',
          isFlashcardNote: false
        });
        const newNote = await window.api.notes.getById(noteId);
        onNoteSelect(newNote);
        onSave();
      }
    }
  };

  const handleLinkHover = async (e) => {
    const target = e.target;
    if (target.classList.contains('wiki-link')) {
      const noteTitle = target.getAttribute('data-note-title');
      if (noteTitle) {
        const rect = target.getBoundingClientRect();
        setPreviewPosition({ x: rect.left, y: rect.bottom + 5 });
        
        const linkedNote = await window.api.notes.getByTitle(noteTitle);
        setLinkPreview(linkedNote);
      }
    } else {
      setLinkPreview(null);
    }
  };

  const insertMarkdown = (syntax, placeholder = 'text') => {
    const textarea = contentRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || placeholder;
    
    let newText;
    let cursorPos;

    switch (syntax) {
      case 'bold':
        newText = `**${selectedText}**`;
        cursorPos = start + 2;
        break;
      case 'italic':
        newText = `*${selectedText}*`;
        cursorPos = start + 1;
        break;
      case 'code':
        newText = `\`${selectedText}\``;
        cursorPos = start + 1;
        break;
      case 'link':
        newText = `[[${selectedText}]]`;
        cursorPos = start + 2;
        break;
      case 'heading':
        newText = `# ${selectedText}`;
        cursorPos = start + 2;
        break;
      case 'list':
        newText = `- ${selectedText}`;
        cursorPos = start + 2;
        break;
      case 'checkbox':
        newText = `- [ ] ${selectedText}`;
        cursorPos = start + 6;
        break;
      case 'strikethrough':
        newText = `~~${selectedText}~~`;
        cursorPos = start + 2;
        break;
      case 'highlight':
        newText = `==${selectedText}==`;
        cursorPos = start + 2;
        break;
      case 'codeblock':
        newText = `\`\`\`\n${selectedText}\n\`\`\``;
        cursorPos = start + 4;
        break;
      case 'blockquote':
        newText = `> ${selectedText}`;
        cursorPos = start + 2;
        break;
      default:
        return;
    }

    const newContent = content.substring(0, start) + newText + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      if (selectedText === placeholder) {
        textarea.setSelectionRange(cursorPos, cursorPos + placeholder.length);
      } else {
        textarea.setSelectionRange(start + newText.length, start + newText.length);
      }
    }, 0);
  };

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        const imageMarkdown = `![${file.name}](${base64})`;
        
        const textarea = contentRef.current;
        const start = textarea.selectionStart;
        const newContent = content.substring(0, start) + imageMarkdown + content.substring(start);
        setContent(newContent);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Failed to upload image');
    }
  };

  // Enhanced markdown renderer with Obsidian-style formatting
  const renderMarkdown = () => {
    if (!content) return { __html: '' };
    
    let html = content;
    
    // Process code blocks first (before other formatting)
    const codeBlocks = [];
    html = html.replace(/```([\w]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const id = `CODE_BLOCK_${codeBlocks.length}`;
      codeBlocks.push(`<pre><code class="language-${lang || 'text'}">${code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
      return id;
    });
    
    // Process inline code
    const inlineCodes = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const id = `INLINE_CODE_${inlineCodes.length}`;
      inlineCodes.push(`<code>${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);
      return id;
    });
    
    // Escape HTML (but preserve placeholders)
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`CODE_BLOCK_${i}`, block);
    });
    
    // Restore inline code
    inlineCodes.forEach((code, i) => {
      html = html.replace(`INLINE_CODE_${i}`, code);
    });
    
    // Headers (H1-H6) - process from most specific to least
    html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />');
    html = html.replace(/^\*\*\*$/gm, '<hr />');
    
    // Task lists (before regular lists)
    html = html.replace(/^[\*\-\+] \[x\] (.+)$/gm, '<li class="task-list-item"><input type="checkbox" checked disabled /> $1</li>');
    html = html.replace(/^[\*\-\+] \[ \] (.+)$/gm, '<li class="task-list-item"><input type="checkbox" disabled /> $1</li>');
    
    // Unordered lists (-, *, +) - but not task lists
    html = html.replace(/^[\*\-\+] (.+)$/gm, (match, text) => {
      if (!text.startsWith('[ ]') && !text.startsWith('[x]')) {
        return `<li>${text}</li>`;
      }
      return match;
    });
    
    // Wrap consecutive list items in ul tags
    html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
      if (match.includes('task-list-item')) {
        return `<ul class="task-list">${match}</ul>`;
      }
      return `<ul>${match}</ul>`;
    });
    
    // Ordered lists
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    html = html.replace(/(<li>\d+\. .*?<\/li>\n?)+/g, (match) => {
      return match.replace(/<li>(\d+)\. /g, '<li>').replace(/<\/li>/g, '</li>');
    });
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
      if (!match.includes('<ul') && !match.includes('task-list')) {
        return `<ol>${match}</ol>`;
      }
      return match;
    });
    
    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    
    // Bold (**text** or __text__) - must come after code processing
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    
    // Italic (*text* or _text_) - but not bold
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
    
    // Strikethrough
    html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    
    // Highlight (==text==)
    html = html.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
    
    // Images ![alt](url) - before links
    html = html.replace(/!\[([^\]]*)\]\(([^\)]+)\)/g, (match, alt, src) => {
      return `<img src="${src}" alt="${alt || ''}" class="markdown-image" />`;
    });
    
    // Links [[wiki links]] - Obsidian style
    html = html.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
      return `<span class="wiki-link-inline" data-note-title="${title}">${title}</span>`;
    });
    
    // Regular markdown links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks - convert double newlines to paragraphs
    const lines = html.split('\n');
    const paragraphs = [];
    let currentPara = [];
    
    lines.forEach(line => {
      if (line.trim() === '' || line.match(/^<[h|u|o|b|p|d]/)) {
        if (currentPara.length > 0) {
          paragraphs.push(`<p>${currentPara.join(' ')}</p>`);
          currentPara = [];
        }
        if (line.trim() !== '') {
          paragraphs.push(line);
        }
      } else {
        currentPara.push(line);
      }
    });
    
    if (currentPara.length > 0) {
      paragraphs.push(`<p>${currentPara.join(' ')}</p>`);
    }
    
    html = paragraphs.join('\n');
    
    // Convert single newlines to <br> within paragraphs
    html = html.replace(/<p>(.+?)<\/p>/g, (match, content) => {
      return `<p>${content.replace(/\n/g, '<br />')}</p>`;
    });
    
    return { __html: html };
  };
  
  const handlePreviewClick = (e) => {
    const target = e.target;
    if (target.classList.contains('wiki-link-inline')) {
      const noteTitle = target.getAttribute('data-note-title');
      if (noteTitle) {
        handleLinkClick(e, noteTitle);
      }
    }
  };

  // Check if note is a flashcard note (use loadedNote if available, otherwise fall back to note prop)
  const noteToCheck = loadedNote || note;
  const isFlashcardNote = noteToCheck && (
    noteToCheck.is_flashcard_note === 1 || 
    noteToCheck.is_flashcard_note === true || 
    noteToCheck.isFlashcardNote === true ||
    noteToCheck.isFlashcardNote === 1 ||
    noteToCheck.note_type === 'flashcard'
  );
  
  // If it's a flashcard note, render FlashcardNoteEditor
  if (isFlashcardNote) {
    return (
      <FlashcardNoteEditor
        note={noteToCheck}
        onSave={onSave}
        onDelete={onDelete}
      />
    );
  }

  // Show empty state only if no note is selected and no content has been entered
  if (!note && !title && !content) {
    return (
      <div className="note-editor">
        <div className="empty-state">
          <div className="empty-state-text">Select a note to edit</div>
          <div className="empty-state-subtext">Or create a new one from the sidebar</div>
        </div>
      </div>
    );
  }

  return (
    <div className="note-editor" onKeyDown={handleKeyDown}>
      <div className="note-editor-toolbar">
        <div className="editor-toolbar-left">
          <button className="toolbar-btn" onClick={() => insertMarkdown('heading')} title="Heading">H</button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('bold')} title="Bold"><strong>B</strong></button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('italic')} title="Italic"><em>I</em></button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('strikethrough')} title="Strikethrough"><del>S</del></button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('highlight')} title="Highlight">H</button>
          <div className="toolbar-divider"></div>
          <button className="toolbar-btn" onClick={() => insertMarkdown('code')} title="Inline Code"><code>C</code></button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('codeblock')} title="Code Block">{'</>'}</button>
          <div className="toolbar-divider"></div>
          <button className="toolbar-btn" onClick={() => insertMarkdown('link')} title="Link">Link</button>
          <button className="toolbar-btn" onClick={handleImageUpload} title="Image">Image</button>
          <div className="toolbar-divider"></div>
          <button className="toolbar-btn" onClick={() => insertMarkdown('list')} title="List">List</button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('checkbox')} title="Checklist">Task</button>
          <button className="toolbar-btn" onClick={() => insertMarkdown('blockquote')} title="Blockquote">Quote</button>
        </div>
      </div>
      
      <div className="note-editor-content">
        <input
          type="text"
          className="note-title-large"
          placeholder="Untitled"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            // Update text direction based on title and content
            const combinedText = e.target.value + ' ' + content;
            setTextDirection(detectTextDirection(combinedText));
          }}
          dir={detectTextDirection(title)}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        <div className="note-content-wrapper">
          {!isEditing && content ? (
            <div 
              className="note-content-preview markdown-preview"
              dir={textDirection}
              onClick={(e) => {
                const target = e.target;
                if (target.classList.contains('wiki-link-inline')) {
                  const noteTitle = target.getAttribute('data-note-title');
                  if (noteTitle) {
                    handleLinkClick(e, noteTitle);
                  }
                } else {
                  // Click anywhere to edit
                  setIsEditing(true);
                  setTimeout(() => {
                    contentRef.current?.focus();
                  }, 0);
                }
              }}
              dangerouslySetInnerHTML={renderMarkdown()}
            />
          ) : (
            <textarea
              ref={contentRef}
              className="note-content-textarea"
              placeholder="Start writing... Use [[note title]] to create links. Ctrl+Click on links to follow them."
              value={content}
              dir={textDirection}
              onChange={(e) => {
                setContent(e.target.value);
                // Update text direction based on title and content
                const combinedText = title + ' ' + e.target.value;
                setTextDirection(detectTextDirection(combinedText));
              }}
              onFocus={() => setIsEditing(true)}
              onBlur={() => {
                // Small delay to allow link clicks
                setTimeout(() => {
                  setIsEditing(false);
                }, 200);
              }}
              onKeyDown={(e) => {
                // Handle Ctrl+Enter for links
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  const textarea = e.target;
                  const clickPos = textarea.selectionStart || textarea.selectionEnd || 0;
                  const linkRegex = /\[\[([^\]]+)\]\]/g;
                  let match;
                  let clickedLink = null;
                  
                  linkRegex.lastIndex = 0;
                  while ((match = linkRegex.exec(content)) !== null) {
                    const startPos = match.index;
                    const endPos = startPos + match[0].length;
                    if (clickPos >= startPos && clickPos <= endPos) {
                      clickedLink = match[1];
                      break;
                    }
                  }
                  
                  if (clickedLink) {
                    e.preventDefault();
                    handleLinkClick(null, clickedLink);
                  }
                }
              }}
              onClick={(e) => {
                // Handle Ctrl+Click for links
                if (e.ctrlKey || e.metaKey) {
                  const textarea = e.target;
                  setTimeout(async () => {
                    const clickPos = textarea.selectionStart || textarea.selectionEnd || 0;
                    const linkRegex = /\[\[([^\]]+)\]\]/g;
                    let match;
                    let clickedLink = null;
                    
                    linkRegex.lastIndex = 0;
                    while ((match = linkRegex.exec(content)) !== null) {
                      const startPos = match.index;
                      const endPos = startPos + match[0].length;
                      if (clickPos >= startPos && clickPos <= endPos) {
                        clickedLink = match[1];
                        break;
                      }
                    }
                    
                    if (clickedLink) {
                      e.preventDefault();
                      await handleLinkClick(null, clickedLink);
                    }
                  }, 0);
                }
              }}
            />
          )}
        </div>
      </div>

      {backlinks.length > 0 && (
        <div className="backlinks-section">
          <div className="backlinks-title">Linked from {backlinks.length} note{backlinks.length !== 1 ? 's' : ''}</div>
          <div className="backlinks-list">
            {backlinks.map(link => (
              <div
                key={link.id}
                className="backlink-item"
                onClick={async () => {
                  const linkedNote = await window.api.notes.getById(link.id);
                  onNoteSelect(linkedNote);
                }}
              >
                {link.title}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="note-metadata">
        <div className="metadata-row">
          <div className="metadata-item">
            <span className="metadata-label">Tags</span>
            <input
              type="text"
              className="metadata-input"
              placeholder="tag1, tag2"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          {note && note.created_at && (
            <div className="metadata-item metadata-date">
              {new Date(note.created_at).toLocaleDateString()}
            </div>
          )}
        </div>
        <div className="metadata-footer">
          <span className="save-status">
            {isSaving ? 'Saving...' : lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString()}` : 'Ready'}
          </span>
          {note && note.id && (
            <button className="metadata-delete-btn" onClick={handleDelete} title="Delete note">
              Delete
            </button>
          )}
        </div>
      </div>

      {linkPreview && (
        <div
          className="link-preview"
          style={{ left: previewPosition.x, top: previewPosition.y }}
        >
          <div className="link-preview-title">{linkPreview.title}</div>
          <div className="link-preview-content">
            {linkPreview.content ? linkPreview.content.substring(0, 150) + '...' : 'Empty note'}
          </div>
        </div>
      )}
    </div>
  );
}

export default NoteEditor;
