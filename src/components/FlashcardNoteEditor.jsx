import React, { useState, useEffect, useRef } from 'react';
import { getNextIntervals } from '../utils/fsrs';

const FIELD_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  FORVO_AUDIO: 'forvo_audio'
};

function FlashcardNoteEditor({ note, onSave, onDelete }) {
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState([]);
  const [createReverse, setCreateReverse] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [cards, setCards] = useState([]);
  const [cardIntervals, setCardIntervals] = useState({});
  const [showScheduling, setShowScheduling] = useState(true);
  const [rescheduleCardId, setRescheduleCardId] = useState(null);
  const [customDueDates, setCustomDueDates] = useState({});
  const [showPronunciationModal, setShowPronunciationModal] = useState(false);
  const [pronunciations, setPronunciations] = useState([]);
  const [loadingPronunciations, setLoadingPronunciations] = useState(false);
  const [currentForvoField, setCurrentForvoField] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  const audioRefs = useRef({});
  const fileInputRefs = useRef({});

  useEffect(() => {
    loadTemplates();
    if (note) {
      setTitle(note.title || '');
      // Always load card data on note change - it will preserve fields if they exist
      loadCardData();
    } else {
      setTitle('');
      resetCardData();
    }
  }, [note?.id]);

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
      const allTemplates = await window.api.templates.getAll();
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadCardData = async (preserveFields = false) => {
    if (!note?.id) return;
    
    try {
      // Reload note from database to get latest content
      const updatedNote = await window.api.notes.getById(note.id);
      if (!updatedNote) return;
      
      const loadedCards = await window.api.cards.getByNote(note.id);
      setCards(loadedCards || []);
      
      // Load intervals for each card
      const intervalsMap = {};
      for (const card of loadedCards || []) {
        try {
          const intervals = await getNextIntervals(card);
          intervalsMap[card.id] = intervals;
        } catch (error) {
          console.error('Failed to load intervals for card:', error);
        }
      }
      setCardIntervals(intervalsMap);
      
      // If preserving fields, only update cards/intervals, don't reload fields
      if (preserveFields) {
        return;
      }
      
      if (loadedCards && loadedCards.length > 0) {
        const card = loadedCards.find(c => c.direction === 'front-to-back') || loadedCards[0];
        
        // Try to load from note content first (if it has fields structure)
        try {
          const contentData = JSON.parse(updatedNote.content || '{}');
          if (contentData.fields && Array.isArray(contentData.fields) && contentData.fields.length > 0) {
            const loadedFields = contentData.fields.map(f => ({ ...f, id: f.id || `${f.type}-${Date.now()}-${Math.random()}` }));
            setFields(sortFields(loadedFields));
            setCreateReverse(contentData.createReverse || false);
            return;
          }
        } catch (e) {
          // Not JSON or doesn't have fields, continue with card-based loading
        }
        
        // Load fields from card data
        const loadedFields = [];
        
        // Text field for front
        if (card.front) {
          loadedFields.push({
            id: 'front-text',
            type: FIELD_TYPES.TEXT,
            value: card.front,
            front: true,
            back: false
          });
        }
        
        // Text field for back
        if (card.back) {
          loadedFields.push({
            id: 'back-text',
            type: FIELD_TYPES.TEXT,
            value: card.back,
            front: false,
            back: true
          });
        }
        
        // Front image
        if (card.front_image) {
          loadedFields.push({
            id: 'front-image',
            type: FIELD_TYPES.IMAGE,
            value: card.front_image,
            front: true,
            back: false
          });
        }
        
        // Back image
        if (card.back_image) {
          loadedFields.push({
            id: 'back-image',
            type: FIELD_TYPES.IMAGE,
            value: card.back_image,
            front: false,
            back: true
          });
        }
        
        // Front audio
        if (card.front_audio) {
          loadedFields.push({
            id: 'front-audio',
            type: FIELD_TYPES.AUDIO,
            value: card.front_audio,
            front: true,
            back: false
          });
        }
        
        // Back audio
        if (card.back_audio) {
          loadedFields.push({
            id: 'back-audio',
            type: FIELD_TYPES.AUDIO,
            value: card.back_audio,
            front: false,
            back: true
          });
        }
        
        // If no fields, add default text fields
        if (loadedFields.length === 0) {
          loadedFields.push(
            { id: 'front-text', type: FIELD_TYPES.TEXT, value: '', front: true, back: false },
            { id: 'back-text', type: FIELD_TYPES.TEXT, value: '', front: false, back: true }
          );
        }
        
        setFields(sortFields(loadedFields));
        
        // Check if reverse card exists
        const reverseCard = loadedCards.find(c => c.direction === 'back-to-front');
        setCreateReverse(!!reverseCard);
      } else {
        resetCardData();
      }
    } catch (error) {
      console.error('Error loading card data:', error);
      resetCardData();
    }
  };

  const resetCardData = () => {
    const defaultFields = [
      { id: 'front-text', type: FIELD_TYPES.TEXT, value: '', front: true, back: false },
      { id: 'back-text', type: FIELD_TYPES.TEXT, value: '', front: false, back: true }
    ];
    setFields(sortFields(defaultFields));
    setCreateReverse(false);
  };

  const handleReschedule = async (cardId, action) => {
    try {
      const card = cards.find(c => c.id === cardId);
      if (!card) return;

      const now = new Date();
      let updateData = { id: cardId };

      switch (action) {
        case 'reset':
          // Reset to new card state
          updateData = {
            ...updateData,
            stability: 0,
            difficulty: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            last_review: null,
            due: now.toISOString(),
            buried_until: null
          };
          break;
        
        case 'due-now':
          // Make card due now
          updateData = {
            ...updateData,
            due: now.toISOString(),
            buried_until: null
          };
          break;
        
        case 'unbury':
          // Remove burial
          updateData = {
            ...updateData,
            buried_until: null
          };
          break;
        
        case 'custom':
          // Set custom due date
          const cardDueDate = customDueDates[cardId];
          if (!cardDueDate) return;
          const customDate = new Date(cardDueDate);
          customDate.setHours(23, 59, 59, 999); // End of day
          updateData = {
            ...updateData,
            due: customDate.toISOString(),
            buried_until: null
          };
          setCustomDueDates(prev => {
            const next = { ...prev };
            delete next[cardId];
            return next;
          });
          break;
        
        default:
          return;
      }

      await window.api.cards.update(updateData);
      
      // Reload card data to refresh scheduling info
      await loadCardData(true);
      
      // Close reschedule options
      setRescheduleCardId(null);
    } catch (error) {
      console.error('Failed to reschedule card:', error);
      alert('Failed to reschedule card: ' + (error.message || 'Unknown error'));
    }
  };

  const addField = (type) => {
    const newField = {
      id: `${type}-${Date.now()}`,
      type: type,
      value: '',
      front: false,
      back: true // Default to back
    };
    setFields(sortFields([...fields, newField]));
  };

  const removeField = (fieldId) => {
    setFields(fields.filter(f => f.id !== fieldId));
  };

  const sortFields = (fieldsToSort) => {
    // Sort fields: front fields first, then back fields
    // Within each group, maintain relative order
    const frontFields = fieldsToSort.filter(f => f.front);
    const backFields = fieldsToSort.filter(f => !f.front);
    return [...frontFields, ...backFields];
  };

  const updateField = (fieldId, updates) => {
    const updatedFields = fields.map(f => 
      f.id === fieldId ? { ...f, ...updates } : f
    );
    // If front/back status changed, reorder fields
    if (updates.front !== undefined || updates.back !== undefined) {
      setFields(sortFields(updatedFields));
    } else {
      setFields(updatedFields);
    }
  };

  const loadTemplate = async (templateId) => {
    try {
      const template = await window.api.templates.getById(templateId);
      if (template) {
        // Reset field IDs to avoid conflicts
        const templateFields = template.fields.map(f => ({
          ...f,
          id: `${f.type}-${Date.now()}-${Math.random()}`,
          value: '' // Clear values when loading template
        }));
        setFields(sortFields(templateFields));
        setCreateReverse(template.create_reverse === 1);
        setShowTemplateMenu(false);
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      alert('Failed to load template: ' + (error.message || 'Unknown error'));
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      await window.api.templates.create({
        name: templateName.trim(),
        fields: fields.map(f => ({
          type: f.type,
          front: f.front,
          back: f.back,
          forvoLanguage: f.forvoLanguage || 'en'
        })),
        createReverse: createReverse
      });
      setTemplateName('');
      setShowSaveTemplate(false);
      await loadTemplates();
      alert('Template saved successfully');
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template: ' + (error.message || 'Unknown error'));
    }
  };

  const handleImageUpload = async (fieldId, file) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target.result;
        try {
          if (window.api?.media?.uploadImage && note?.id) {
            const imagePath = await window.api.media.uploadImage({
              noteId: note.id,
              imageData: base64Data,
              fieldId: fieldId
            });
            updateField(fieldId, { value: imagePath });
          } else {
            const imageUrl = URL.createObjectURL(file);
            updateField(fieldId, { value: imageUrl });
          }
        } catch (error) {
          console.error('Failed to upload image:', error);
          const imageUrl = URL.createObjectURL(file);
          updateField(fieldId, { value: imageUrl });
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to read image file:', error);
      alert('Failed to load image: ' + (error.message || 'Unknown error'));
    }
  };

  const handleAudioUpload = async (fieldId, file) => {
    try {
      const audioUrl = URL.createObjectURL(file);
      updateField(fieldId, { value: audioUrl });
    } catch (error) {
      console.error('Failed to load audio file:', error);
      alert('Failed to load audio: ' + (error.message || 'Unknown error'));
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }

    // Collect front and back content from fields
    const frontFields = fields.filter(f => f.front);
    const backFields = fields.filter(f => f.back);

    // Build front text (combine all text fields)
    const frontText = frontFields
      .filter(f => f.type === FIELD_TYPES.TEXT)
      .map(f => f.value)
      .join('\n\n')
      .trim();

    // Build back text (combine all text fields)
    const backText = backFields
      .filter(f => f.type === FIELD_TYPES.TEXT)
      .map(f => f.value)
      .join('\n\n')
      .trim();

    if (!frontText && !backText) {
      alert('Please add at least one text field on the front or back');
      return;
    }

    setIsSaving(true);
    try {
      // Save/update note
      const noteUpdate = {
        id: note?.id,
        title: title.trim(),
        content: JSON.stringify({ fields, createReverse }),
        noteType: 'flashcard',
        isFlashcardNote: true,
        folderId: note?.folder_id || null,
        tags: note?.tags || ''
      };

      let noteId = note?.id;
      if (noteId) {
        await window.api.notes.update(noteUpdate);
      } else {
        noteId = await window.api.notes.create({
          ...noteUpdate,
          folderId: null,
          tags: ''
        });
      }

      // Create or update cards
      await createOrUpdateCards(noteId);

      // Reload card data to update scheduling information, but preserve current fields
      await loadCardData(true);

      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Failed to save flashcard note:', error);
      alert('Failed to save: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const createOrUpdateCards = async (noteId) => {
    const existingCards = await window.api.cards.getByNote(noteId);

    // Build front and back content from fields
    const frontFields = fields.filter(f => f.front);
    const backFields = fields.filter(f => f.back);

    // Front content
    const frontText = frontFields
      .filter(f => f.type === FIELD_TYPES.TEXT)
      .map(f => f.value)
      .join('\n\n')
      .trim() || ' ';

    const frontImage = frontFields.find(f => f.type === FIELD_TYPES.IMAGE)?.value || null;
    const frontAudio = frontFields.find(f => 
      f.type === FIELD_TYPES.AUDIO || f.type === FIELD_TYPES.FORVO_AUDIO
    )?.value || null;

    // Back content
    const backText = backFields
      .filter(f => f.type === FIELD_TYPES.TEXT)
      .map(f => f.value)
      .join('\n\n')
      .trim() || ' ';

    const backImage = backFields.find(f => f.type === FIELD_TYPES.IMAGE)?.value || null;
    const backAudio = backFields.find(f => 
      f.type === FIELD_TYPES.AUDIO || f.type === FIELD_TYPES.FORVO_AUDIO
    )?.value || null;

    // Find existing cards by direction
    const frontToBackCards = existingCards.filter(c => c.direction === 'front-to-back');
    const backToFrontCards = existingCards.filter(c => c.direction === 'back-to-front');
    
    // Keep only the first card of each direction, delete duplicates
    if (frontToBackCards.length > 1) {
      for (let i = 1; i < frontToBackCards.length; i++) {
        try {
          await window.api.cards.delete(frontToBackCards[i].id);
        } catch (error) {
          console.error('Failed to delete duplicate front-to-back card:', error);
        }
      }
    }
    if (backToFrontCards.length > 1) {
      for (let i = 1; i < backToFrontCards.length; i++) {
        try {
          await window.api.cards.delete(backToFrontCards[i].id);
        } catch (error) {
          console.error('Failed to delete duplicate back-to-front card:', error);
        }
      }
    }

    // Create or update front-to-back card
    const frontToBackCard = frontToBackCards[0];
    const cardData = {
      note_id: noteId,
      front: frontText,
      back: backText,
      front_audio: frontAudio,
      back_audio: backAudio,
      front_image: frontImage,
      back_image: backImage,
      direction: 'front-to-back'
    };

    try {
      if (frontToBackCard) {
        await window.api.cards.update({ ...cardData, id: frontToBackCard.id });
      } else {
        await window.api.cards.create({ ...cardData, createReverse: false });
      }
    } catch (error) {
      console.error('Failed to create/update front-to-back card:', error);
    }

    // Create or update reverse card if enabled
    if (createReverse) {
      const backToFrontCard = backToFrontCards[0];
      const reverseCardData = {
        note_id: noteId,
        front: backText,
        back: frontText,
        front_audio: backAudio,
        back_audio: frontAudio,
        front_image: backImage,
        back_image: frontImage,
        direction: 'back-to-front'
      };

      try {
        if (backToFrontCard) {
          await window.api.cards.update({ ...reverseCardData, id: backToFrontCard.id });
        } else {
          await window.api.cards.create(reverseCardData);
        }
      } catch (error) {
        console.error('Failed to create/update reverse card:', error);
      }
    } else {
      // Delete all reverse cards if disabled
      for (const card of backToFrontCards) {
        try {
          await window.api.cards.delete(card.id);
        } catch (error) {
          console.error('Failed to delete reverse card:', error);
        }
      }
    }
  };

  const handleDelete = async () => {
    if (!note?.id) return;
    
    if (confirm('Are you sure you want to delete this flashcard note? This will also delete all associated flashcards.')) {
      try {
        await window.api.notes.delete(note.id);
        if (onDelete) {
          onDelete();
        }
      } catch (error) {
        console.error('Failed to delete flashcard note:', error);
        alert('Failed to delete: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const renderField = (field) => {
    return (
      <div key={field.id} className="flashcard-field">
        <div className="field-header">
          <div className="field-type-label">
            {field.type === FIELD_TYPES.TEXT && 'Text'}
            {field.type === FIELD_TYPES.IMAGE && 'Image'}
            {field.type === FIELD_TYPES.AUDIO && 'Audio'}
            {field.type === FIELD_TYPES.FORVO_AUDIO && 'Forvo Audio'}
          </div>
          <div className="field-sides">
            <label>
              <input
                type="checkbox"
                checked={field.front}
                onChange={(e) => updateField(field.id, { front: e.target.checked })}
              />
              Front
            </label>
            <label>
              <input
                type="checkbox"
                checked={field.back}
                onChange={(e) => updateField(field.id, { back: e.target.checked })}
              />
              Back
            </label>
          </div>
          <button
            className="remove-field-btn"
            onClick={() => removeField(field.id)}
            title="Remove field"
          >
            ×
          </button>
        </div>

        <div className="field-content">
          {field.type === FIELD_TYPES.TEXT && (
            <textarea
              className="field-textarea"
              placeholder="Enter text..."
              value={field.value}
              onChange={(e) => updateField(field.id, { value: e.target.value })}
              rows={3}
            />
          )}

          {field.type === FIELD_TYPES.IMAGE && (
            <>
              {field.value ? (
                <div className="field-media-preview">
                  <img src={field.value} alt="Field" className="field-image-preview" />
                  <button
                    className="remove-media-btn"
                    onClick={() => updateField(field.id, { value: '' })}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  className="field-upload-btn"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(field.id, file);
                    };
                    input.click();
                  }}
                >
                  Upload Image
                </button>
              )}
            </>
          )}

          {(field.type === FIELD_TYPES.AUDIO || field.type === FIELD_TYPES.FORVO_AUDIO) && (
            <>
              {field.value ? (
                <div className="field-media-preview">
                  <audio controls src={field.value} className="field-audio-preview" />
                  <button
                    className="remove-media-btn"
                    onClick={() => updateField(field.id, { value: '' })}
                  >
                    ×
                  </button>
                </div>
              ) : field.type === FIELD_TYPES.FORVO_AUDIO ? (
                <div className="forvo-field-controls">
                  <input
                    type="text"
                    placeholder="Word..."
                    value={field.forvoWord || ''}
                    onChange={(e) => updateField(field.id, { forvoWord: e.target.value })}
                  />
                  <select
                    value={field.forvoLanguage || 'en'}
                    onChange={(e) => updateField(field.id, { forvoLanguage: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="ru">Russian</option>
                    <option value="fa">Farsi</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese</option>
                    <option value="ko">Korean</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!field.forvoWord?.trim()) {
                        alert('Please enter a word');
                        return;
                      }
                      setCurrentForvoField(field);
                      setLoadingPronunciations(true);
                      setShowPronunciationModal(true);
                      try {
                        const result = await window.api.audio.listForvoPronunciations({
                          word: field.forvoWord.trim(),
                          language: field.forvoLanguage || 'en'
                        });
                        console.log('Pronunciations result:', result);
                        // Handle both array and object with pronunciations property
                        const pronunciationsList = Array.isArray(result) ? result : (result?.pronunciations || []);
                        console.log('Setting pronunciations:', pronunciationsList);
                        setPronunciations(pronunciationsList);
                      } catch (error) {
                        console.error('Failed to fetch pronunciations:', error);
                        alert('Failed to fetch pronunciations: ' + (error.message || 'Unknown error'));
                        setShowPronunciationModal(false);
                      } finally {
                        setLoadingPronunciations(false);
                      }
                    }}
                  >
                    Fetch
                  </button>
                </div>
              ) : (
                <button
                  className="field-upload-btn"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'audio/*';
                    input.onchange = (e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAudioUpload(field.id, file);
                    };
                    input.click();
                  }}
                >
                  Upload Audio
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (!note && !title) {
    return (
      <div className="flashcard-editor empty">
        <div className="empty-state">
          <p>Select a flashcard note or create a new one to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flashcard-editor">
      <div className="flashcard-editor-header">
        <div className="flashcard-title-section">
          <h2 className="flashcard-editor-title">Cards for:</h2>
          <input
            type="text"
            className="flashcard-title-input"
            placeholder="Untitled Flashcard"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="header-actions">
          <div className="template-menu-container">
            <button
              className="template-btn"
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
            >
              Templates
            </button>
            {showTemplateMenu && (
              <div className="template-menu">
                <div className="template-menu-header">
                  <span>Load Template</span>
                  <button
                    className="template-close-btn"
                    onClick={() => setShowTemplateMenu(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="template-list">
                  {templates.length === 0 ? (
                    <div className="template-empty">No templates saved</div>
                  ) : (
                    templates.map(template => (
                      <div
                        key={template.id}
                        className="template-item"
                        onClick={() => loadTemplate(template.id)}
                      >
                        <span>{template.name}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="template-menu-footer">
                  <button
                    className="save-template-btn"
                    onClick={() => {
                      setShowSaveTemplate(true);
                      setShowTemplateMenu(false);
                    }}
                  >
                    Save Current Layout
                  </button>
                </div>
              </div>
            )}
          </div>
          <button className="save-btn" onClick={handleSave}>
            {note?.id ? 'Update' : 'Create'}
          </button>
        </div>
      </div>

      {showSaveTemplate && (
        <div 
          className="save-template-modal"
          onClick={(e) => {
            if (e.target.classList.contains('save-template-modal')) {
              setShowSaveTemplate(false);
              setTemplateName('');
            }
          }}
        >
          <div className="save-template-content">
            <h3>Save Template</h3>
            <input
              type="text"
              className="template-name-input"
              placeholder="Template name..."
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveTemplate();
                } else if (e.key === 'Escape') {
                  setShowSaveTemplate(false);
                  setTemplateName('');
                }
              }}
              autoFocus
            />
            <div className="save-template-actions">
              <button className="save-template-confirm-btn" onClick={saveTemplate}>
                Save
              </button>
              <button
                className="save-template-cancel-btn"
                onClick={() => {
                  setShowSaveTemplate(false);
                  setTemplateName('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flashcard-card-panel">
        {/* Fields Section */}
        <div className="fields-section">
          <div className="fields-header">
            <h3>Fields</h3>
            <div className="add-field-buttons">
              <button
                className="add-field-btn"
                onClick={() => addField(FIELD_TYPES.TEXT)}
              >
                Text
              </button>
              <button
                className="add-field-btn"
                onClick={() => addField(FIELD_TYPES.IMAGE)}
              >
                Image
              </button>
              <button
                className="add-field-btn"
                onClick={() => addField(FIELD_TYPES.AUDIO)}
              >
                Audio
              </button>
              <button
                className="add-field-btn"
                onClick={() => {
                  const newField = {
                    id: `forvo-${Date.now()}`,
                    type: FIELD_TYPES.FORVO_AUDIO,
                    value: '',
                    front: false,
                    back: true,
                    forvoWord: '',
                    forvoLanguage: 'en'
                  };
                  setFields(sortFields([...fields, newField]));
                }}
              >
                Forvo
              </button>
            </div>
          </div>

          <div className="fields-list">
            {sortFields(fields).map(renderField)}
          </div>
        </div>

        {/* Card Options */}
        <div className="card-options">
          <label className="card-option-checkbox">
            <input
              type="checkbox"
              checked={createReverse}
              onChange={(e) => setCreateReverse(e.target.checked)}
            />
            <span>Create reverse card</span>
          </label>
        </div>
      </div>

      {/* Scheduling Information */}
      {note?.id && cards.length > 0 && (
        <div className="scheduling-info-section">
          <div className="scheduling-header" onClick={() => setShowScheduling(!showScheduling)}>
            <h3>Scheduling Information</h3>
            <span className="toggle-icon">{showScheduling ? '▼' : '▶'}</span>
          </div>
          {showScheduling && (
            <div className="scheduling-content">
              {cards.map((card) => {
                const dueDate = card.due ? new Date(card.due) : null;
                const now = new Date();
                const daysUntil = dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : null;
                const isOverdue = dueDate && dueDate < now;
                const intervals = cardIntervals[card.id] || {};
                const stateNames = { 0: 'New', 1: 'Learning', 2: 'Review', 3: 'Relearning' };
                
                return (
                  <div key={card.id} className="card-scheduling-info">
                    <div className="card-scheduling-header">
                      <h4>{card.direction === 'front-to-back' ? 'Front → Back' : 'Back → Front'}</h4>
                      {card.buried_until && (
                        <span className="buried-badge">Buried until {new Date(card.buried_until).toLocaleDateString()}</span>
                      )}
                    </div>
                    
                    <div className="scheduling-grid">
                      <div className="scheduling-item">
                        <span className="scheduling-label">Next Review:</span>
                        <span className={`scheduling-value ${isOverdue ? 'overdue' : ''}`}>
                          {dueDate 
                            ? (isOverdue 
                                ? `${Math.abs(daysUntil)} days overdue` 
                                : daysUntil === 0 
                                  ? 'Today' 
                                  : daysUntil === 1 
                                    ? 'Tomorrow' 
                                    : `${daysUntil} days`)
                            : 'Not scheduled'}
                        </span>
                        {dueDate && (
                          <span className="scheduling-date">{dueDate.toLocaleDateString()}</span>
                        )}
                      </div>
                      
                      <div className="scheduling-item">
                        <span className="scheduling-label">State:</span>
                        <span className="scheduling-value">{stateNames[card.state] || 'Unknown'}</span>
                      </div>
                      
                      <div className="scheduling-item">
                        <span className="scheduling-label">Stability:</span>
                        <span className="scheduling-value">{card.stability ? card.stability.toFixed(1) : '0.0'} days</span>
                      </div>
                      
                      <div className="scheduling-item">
                        <span className="scheduling-label">Difficulty:</span>
                        <span className="scheduling-value">{card.difficulty ? card.difficulty.toFixed(2) : '0.00'}</span>
                      </div>
                      
                      <div className="scheduling-item">
                        <span className="scheduling-label">Reviews:</span>
                        <span className="scheduling-value">{card.reps || 0}</span>
                      </div>
                      
                      <div className="scheduling-item">
                        <span className="scheduling-label">Lapses:</span>
                        <span className="scheduling-value">{card.lapses || 0}</span>
                      </div>
                      
                      {card.last_review && (
                        <div className="scheduling-item">
                          <span className="scheduling-label">Last Review:</span>
                          <span className="scheduling-value">{new Date(card.last_review).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    
                    {intervals && Object.keys(intervals).length > 0 && (
                      <div className="intervals-preview">
                        <div className="intervals-label">Preview Intervals:</div>
                        <div className="intervals-list">
                          {intervals[1] !== undefined && (
                            <span className="interval-item">
                              <span className="interval-rating">Fail:</span>
                              <span className="interval-days">{intervals[1]} days</span>
                            </span>
                          )}
                          {intervals[3] !== undefined && (
                            <span className="interval-item">
                              <span className="interval-rating">Good:</span>
                              <span className="interval-days">{intervals[3]} days</span>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Rescheduling Options */}
                    <div className="reschedule-section">
                      <div className="reschedule-header">
                        <span className="reschedule-label">Reschedule:</span>
                        <button
                          className="reschedule-btn"
                          onClick={() => setRescheduleCardId(rescheduleCardId === card.id ? null : card.id)}
                        >
                          {rescheduleCardId === card.id ? 'Hide Options' : 'Show Options'}
                        </button>
                      </div>
                      
                      {rescheduleCardId === card.id && (
                        <div className="reschedule-options">
                          <div className="reschedule-buttons">
                            <button
                              className="reschedule-action-btn"
                              onClick={() => handleReschedule(card.id, 'reset')}
                            >
                              Reset to New
                            </button>
                            <button
                              className="reschedule-action-btn"
                              onClick={() => handleReschedule(card.id, 'due-now')}
                            >
                              Make Due Now
                            </button>
                            <button
                              className="reschedule-action-btn"
                              onClick={() => handleReschedule(card.id, 'unbury')}
                              disabled={!card.buried_until}
                            >
                              Unbury
                            </button>
                          </div>
                          
                          <div className="custom-due-date">
                            <label>Custom Due Date:</label>
                            <input
                              type="date"
                              value={customDueDates[card.id] || ''}
                              onChange={(e) => setCustomDueDates(prev => ({ ...prev, [card.id]: e.target.value }))}
                              className="due-date-input"
                            />
                            <button
                              className="reschedule-action-btn"
                              onClick={() => handleReschedule(card.id, 'custom')}
                              disabled={!customDueDates[card.id]}
                            >
                              Set Date
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pronunciation Selection Modal */}
      {showPronunciationModal && (
        <div className="modal-overlay" onClick={() => setShowPronunciationModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              Select Pronunciation
              {currentForvoField && (
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Word: <strong>{currentForvoField.forvoWord}</strong>
                </div>
              )}
            </div>
            <div className="modal-body">
              {loadingPronunciations ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Loading pronunciations...</div>
              ) : pronunciations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  No pronunciations found
                </div>
              ) : (
                <div className="pronunciation-list">
                  {pronunciations.map((pronunciation, index) => {
                    const audioId = `audio-preview-${index}`;
                    const isPlaying = playingAudio === index;
                    
                    return (
                      <div
                        key={index}
                        className="pronunciation-item"
                      >
                        <div className="pronunciation-info">
                          <div className="pronunciation-header">
                            <span className="pronunciation-lang">{pronunciation.languageCode?.toUpperCase() || 'UNKNOWN'}</span>
                            {pronunciation.rate > 0 && (
                              <span className="pronunciation-rate">★ {pronunciation.rate}</span>
                            )}
                          </div>
                          <div className="pronunciation-user">
                            by {pronunciation.username || 'Forvo'}
                          </div>
                        </div>
                        <div className="pronunciation-actions">
                          <button
                            className="pronunciation-play-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const audio = audioRefs.current[audioId];
                              if (audio) {
                                if (isPlaying) {
                                  audio.pause();
                                  audio.currentTime = 0;
                                  setPlayingAudio(null);
                                } else {
                                  // Stop any other playing audio
                                  Object.values(audioRefs.current).forEach(a => {
                                    if (a && !a.paused) {
                                      a.pause();
                                      a.currentTime = 0;
                                    }
                                  });
                                  audio.play();
                                  setPlayingAudio(index);
                                  audio.onended = () => setPlayingAudio(null);
                                  audio.onerror = () => {
                                    setPlayingAudio(null);
                                    alert('Failed to play audio preview');
                                  };
                                }
                              }
                            }}
                            title={isPlaying ? 'Stop' : 'Play preview'}
                          >
                            {isPlaying ? '⏸' : '▶'}
                          </button>
                          <audio
                            ref={el => audioRefs.current[audioId] = el}
                            src={pronunciation.url}
                            preload="none"
                            style={{ display: 'none' }}
                          />
                          <button
                            className="pronunciation-select-btn"
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Immediately update the field with the Forvo URL so it works right away
                              updateField(currentForvoField.id, { value: pronunciation.url });
                              setShowPronunciationModal(false);
                              
                              // Download in the background and update with local file when done
                              // This allows the user to use the audio immediately while it downloads
                              (async () => {
                                try {
                                  const result = await window.api.audio.downloadForvoPronunciation({
                                    word: currentForvoField.forvoWord.trim(),
                                    language: currentForvoField.forvoLanguage || 'en',
                                    pronunciationUrl: pronunciation.url
                                  });
                                  if (result && (result.fileUrl || result.filepath)) {
                                    // Update to local file URL for offline access
                                    updateField(currentForvoField.id, { value: result.fileUrl || result.filepath });
                                  }
                                } catch (error) {
                                  console.error('Background download failed:', error);
                                  // Don't show error to user since they can still use the online URL
                                }
                              })();
                            }}
                          >
                            Select
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowPronunciationModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlashcardNoteEditor;
