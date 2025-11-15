import React, { useState, useEffect } from 'react';

function FlashcardSettingsView({ onUpdate, onNoteSelect }) {
  const [requestRetention, setRequestRetention] = useState(0.9);
  const [maximumInterval, setMaximumInterval] = useState(36500);
  const [burySiblingCards, setBurySiblingCards] = useState(false);
  const [reviewNewCardsFirst, setReviewNewCardsFirst] = useState(false);
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [reviewFontFamily, setReviewFontFamily] = useState('');
  const [reviewFontSize, setReviewFontSize] = useState(24);
  const [reviewBackFontSize, setReviewBackFontSize] = useState(18);

  useEffect(() => {
    loadSettings();
    loadCards();
    loadStats();
  }, []);

  const loadSettings = async () => {
    const retention = await window.api.settings.get('request_retention');
    const maxInterval = await window.api.settings.get('maximum_interval');
    const burySiblings = await window.api.settings.get('bury_sibling_cards');
    const newCardsFirst = await window.api.settings.get('review_new_cards_first');
    const fontFamily = await window.api.settings.get('review_font_family');
    const fontSize = await window.api.settings.get('review_font_size');
    const backFontSize = await window.api.settings.get('review_back_font_size');
    
    if (retention) setRequestRetention(parseFloat(retention));
    if (maxInterval) setMaximumInterval(parseInt(maxInterval));
    if (burySiblings) setBurySiblingCards(burySiblings === 'true');
    if (newCardsFirst) setReviewNewCardsFirst(newCardsFirst === 'true');
    if (fontFamily) setReviewFontFamily(fontFamily);
    if (fontSize) setReviewFontSize(parseInt(fontSize) || 24);
    if (backFontSize) setReviewBackFontSize(parseInt(backFontSize) || 18);
  };

  const loadCards = async () => {
    const allCards = await window.api.cards.getAll();
    // Get note titles for each card
    const cardsWithNotes = await Promise.all(
      allCards.map(async (card) => {
        if (card.note_id) {
          try {
            const note = await window.api.notes.getById(card.note_id);
            return { ...card, noteTitle: note?.title || 'Unknown' };
          } catch (e) {
            return { ...card, noteTitle: 'Unknown' };
          }
        }
        return { ...card, noteTitle: 'Unknown' };
      })
    );
    setCards(cardsWithNotes);
  };

  const loadStats = async () => {
    const data = await window.api.stats.get();
    setStats(data);
  };

  const handleSaveSettings = async () => {
    try {
      await window.api.settings.set({ key: 'request_retention', value: requestRetention.toString() });
      await window.api.settings.set({ key: 'maximum_interval', value: maximumInterval.toString() });
      await window.api.settings.set({ key: 'bury_sibling_cards', value: burySiblingCards.toString() });
      await window.api.settings.set({ key: 'review_new_cards_first', value: reviewNewCardsFirst.toString() });
      await window.api.settings.set({ key: 'review_font_family', value: reviewFontFamily });
      await window.api.settings.set({ key: 'review_font_size', value: reviewFontSize.toString() });
      await window.api.settings.set({ key: 'review_back_font_size', value: reviewBackFontSize.toString() });
      
      alert('Settings saved successfully');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + (error.message || 'Unknown error'));
    }
  };

  const handleCardSelect = async (card, event) => {
    // Don't navigate if clicking the Edit button
    if (event && event.target.closest('.btn-edit-card')) {
      return;
    }
    
    setSelectedCard(card);
    setEditingCard(null);
    
    // Navigate to the flashcard note in the knowledge tree
    if (card.note_id && onNoteSelect) {
      try {
        const note = await window.api.notes.getById(card.note_id);
        if (note) {
          onNoteSelect(note);
        }
      } catch (error) {
        console.error('Failed to load note:', error);
      }
    }
  };

  const handleEditCard = (card) => {
    setEditingCard({ ...card });
    setSelectedCard(card);
  };

  const handleCancelEdit = () => {
    setEditingCard(null);
  };

  const handleSaveCard = async () => {
    if (!editingCard || !editingCard.note_id) return;
    
    setIsSaving(true);
    try {
      // Load the note to get its fields structure
      const note = await window.api.notes.getById(editingCard.note_id);
      if (!note) {
        throw new Error('Note not found');
      }

      // Find related card (parent or child) if this is a reversed flashcard
      let relatedCard = null;
      if (editingCard.parent_card_id) {
        // This is a reverse card, find the parent
        relatedCard = cards.find(c => c.id === editingCard.parent_card_id);
      } else {
        // This might be a parent card, find the reverse
        relatedCard = cards.find(c => c.parent_card_id === editingCard.id);
      }

      // Parse note content to get fields structure
      let noteFields = [];
      let createReverse = false;
      try {
        const contentData = JSON.parse(note.content || '{}');
        if (contentData.fields && Array.isArray(contentData.fields)) {
          noteFields = contentData.fields;
          createReverse = contentData.createReverse || false;
        }
      } catch (e) {
        // If no fields structure, we'll create one from the card data
      }

      // Determine which card we're editing (front-to-back or back-to-front)
      const isEditingReverse = editingCard.direction === 'back-to-front';
      
      // Update fields based on which card is being edited
      if (noteFields.length > 0) {
        // Update existing fields
        const frontFields = noteFields.filter(f => f.front);
        const backFields = noteFields.filter(f => f.back);
        
        // Update text fields based on card direction
        if (isEditingReverse) {
          // Editing reverse card: update back fields with front content, front fields with back content
          const backTextFields = backFields.filter(f => f.type === 'text');
          const frontTextFields = frontFields.filter(f => f.type === 'text');
          
          // Update back text fields with the new front content
          if (backTextFields.length > 0) {
            backTextFields[0].value = editingCard.front;
          }
          // Update front text fields with the new back content
          if (frontTextFields.length > 0) {
            frontTextFields[0].value = editingCard.back;
          }
          
          // Update media fields
          const backImageField = backFields.find(f => f.type === 'image');
          const frontImageField = frontFields.find(f => f.type === 'image');
          if (backImageField) backImageField.value = editingCard.front_image || '';
          if (frontImageField) frontImageField.value = editingCard.back_image || '';
          
          const backAudioField = backFields.find(f => f.type === 'audio' || f.type === 'forvo_audio');
          const frontAudioField = frontFields.find(f => f.type === 'audio' || f.type === 'forvo_audio');
          if (backAudioField) backAudioField.value = editingCard.front_audio || '';
          if (frontAudioField) frontAudioField.value = editingCard.back_audio || '';
        } else {
          // Editing normal card: update front fields with front content, back fields with back content
          const frontTextFields = frontFields.filter(f => f.type === 'text');
          const backTextFields = backFields.filter(f => f.type === 'text');
          
          if (frontTextFields.length > 0) {
            frontTextFields[0].value = editingCard.front;
          }
          if (backTextFields.length > 0) {
            backTextFields[0].value = editingCard.back;
          }
          
          // Update media fields
          const frontImageField = frontFields.find(f => f.type === 'image');
          const backImageField = backFields.find(f => f.type === 'image');
          if (frontImageField) frontImageField.value = editingCard.front_image || '';
          if (backImageField) backImageField.value = editingCard.back_image || '';
          
          const frontAudioField = frontFields.find(f => f.type === 'audio' || f.type === 'forvo_audio');
          const backAudioField = backFields.find(f => f.type === 'audio' || f.type === 'forvo_audio');
          if (frontAudioField) frontAudioField.value = editingCard.front_audio || '';
          if (backAudioField) backAudioField.value = editingCard.back_audio || '';
        }
        
        // Update note content with modified fields
        await window.api.notes.update({
          id: note.id,
          content: JSON.stringify({ fields: noteFields, createReverse })
        });
      }

      // Update the current card
      const updateData = {
        id: editingCard.id,
        front: editingCard.front,
        back: editingCard.back,
        front_audio: editingCard.front_audio,
        back_audio: editingCard.back_audio,
        front_image: editingCard.front_image,
        back_image: editingCard.back_image
      };
      await window.api.cards.update(updateData);

      // If there's a related card, update it with swapped content
      if (relatedCard) {
        const relatedUpdateData = {
          id: relatedCard.id,
          // Swap front/back for the reverse card
          front: editingCard.back,
          back: editingCard.front,
          front_audio: editingCard.back_audio,
          back_audio: editingCard.front_audio,
          front_image: editingCard.back_image,
          back_image: editingCard.front_image
        };
        await window.api.cards.update(relatedUpdateData);
      }

      await loadCards();
      await loadStats();
      if (onUpdate) onUpdate();
      setEditingCard(null);
      setSelectedCard(null);
      alert('Card updated successfully. Both cards have been synced.');
    } catch (error) {
      console.error('Failed to save card:', error);
      alert('Failed to save card: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCards = cards.filter(card => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      card.front?.toLowerCase().includes(query) ||
      card.back?.toLowerCase().includes(query) ||
      card.noteTitle?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flashcard-settings-view">
      <div className="settings-header">
        <h2>Flashcard Settings</h2>
      </div>

      <div className="settings-content">
        {/* Scheduling Settings */}
        <div className="settings-section">
          <h3>Scheduling (FSRS)</h3>
          <div className="settings-group">
            <label>
              Request Retention
              <input
                type="number"
                min="0.1"
                max="0.99"
                step="0.01"
                value={requestRetention}
                onChange={(e) => setRequestRetention(parseFloat(e.target.value))}
              />
              <span className="setting-description">Target retention rate (0.1-0.99). Higher = more reviews, better retention.</span>
            </label>
            <label>
              Maximum Interval (days)
              <input
                type="number"
                min="1"
                max="36500"
                step="1"
                value={maximumInterval}
                onChange={(e) => setMaximumInterval(parseInt(e.target.value))}
              />
              <span className="setting-description">Maximum days between reviews (1-36500).</span>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={burySiblingCards}
                onChange={(e) => setBurySiblingCards(e.target.checked)}
              />
              <span>Bury sibling cards</span>
            </label>
            <span className="setting-description" style={{ marginTop: '-12px', marginLeft: '24px' }}>
              When reviewing a card, bury its reverse card until the next day.
            </span>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={reviewNewCardsFirst}
                onChange={(e) => setReviewNewCardsFirst(e.target.checked)}
              />
              <span>Review new cards first</span>
            </label>
            <span className="setting-description" style={{ marginTop: '-12px', marginLeft: '24px' }}>
              Show new cards before cards in review.
            </span>
            <button onClick={handleSaveSettings} className="btn-primary" style={{ marginTop: '8px' }}>
              Save Settings
            </button>
          </div>
        </div>

        {/* Review Display Settings */}
        <div className="settings-section">
          <h3>Review Display</h3>
          <div className="settings-group">
            <label>
              Font Family
              <input
                type="text"
                placeholder="e.g., Arial, Georgia, 'Times New Roman'"
                value={reviewFontFamily}
                onChange={(e) => setReviewFontFamily(e.target.value)}
              />
              <span className="setting-description">Font family for flashcard text (leave empty for default).</span>
            </label>
            <label>
              Front Text Size (px)
              <input
                type="number"
                min="12"
                max="72"
                step="1"
                value={reviewFontSize}
                onChange={(e) => setReviewFontSize(parseInt(e.target.value) || 24)}
              />
              <span className="setting-description">Font size for the front of cards (12-72px).</span>
            </label>
            <label>
              Back Text Size (px)
              <input
                type="number"
                min="12"
                max="72"
                step="1"
                value={reviewBackFontSize}
                onChange={(e) => setReviewBackFontSize(parseInt(e.target.value) || 18)}
              />
              <span className="setting-description">Font size for the back of cards (12-72px).</span>
            </label>
            <button onClick={handleSaveSettings} className="btn-primary" style={{ marginTop: '8px' }}>
              Save Display Settings
            </button>
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="settings-section">
            <h3>Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Total Cards:</span>
                <span className="stat-value">{stats.cardsCount || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Due Today:</span>
                <span className="stat-value">{stats.dueCards || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">New Cards:</span>
                <span className="stat-value">{stats.newCards || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Reviews:</span>
                <span className="stat-value">{stats.totalReviews || 0}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Difficulty:</span>
                <span className="stat-value">{(stats.avgDifficulty || 0).toFixed(2)}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg Stability:</span>
                <span className="stat-value">{(stats.avgStability || 0).toFixed(1)}d</span>
              </div>
            </div>
          </div>
        )}

        {/* Card List and Editor */}
        <div className="settings-section">
          <div className="section-header">
            <h3>All Cards</h3>
            <div className="search-bar-small">
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="cards-editor-layout">
            {/* Card List */}
            <div className="cards-list-panel">
              <div className="cards-list-header">
                <span>{filteredCards.length} cards</span>
                <button onClick={loadCards} className="btn-icon" title="Refresh">
                  Refresh
                </button>
              </div>
              <div className="cards-list">
                {filteredCards.map(card => (
                  <div
                    key={card.id}
                    className={`card-list-item ${selectedCard?.id === card.id ? 'selected' : ''}`}
                    onClick={(e) => handleCardSelect(card, e)}
                  >
                    <div className="card-list-item-header">
                      <span className="card-note-title">{card.noteTitle}</span>
                      {card.direction && (
                        <span className="card-direction-badge">
                          {card.direction === 'back-to-front' ? 'Reverse' : 'Normal'}
                        </span>
                      )}
                    </div>
                    <div className="card-list-item-preview">
                      <div className="preview-front">
                        <strong>Front:</strong> {card.front?.substring(0, 50) || '(empty)'}
                        {card.front?.length > 50 && '...'}
                      </div>
                      <div className="preview-back">
                        <strong>Back:</strong> {card.back?.substring(0, 50) || '(empty)'}
                        {card.back?.length > 50 && '...'}
                      </div>
                    </div>
                    <div className="card-list-item-stats">
                      <span>Reps: {card.reps || 0}</span>
                      <span>Stability: {(card.stability || 0).toFixed(1)}d</span>
                    </div>
                    <button
                      className="btn-edit-card"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCard(card);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
              {filteredCards.length === 0 && (
                <div className="empty-state">
                  <p>No cards found</p>
                </div>
              )}
            </div>

            {/* Card Editor */}
            {editingCard && (
              <div className="card-editor-panel">
                <div className="card-editor-header">
                  <h4>Edit Card</h4>
                  <div className="card-editor-actions">
                    <button
                      onClick={handleSaveCard}
                      disabled={isSaving}
                      className="btn-primary btn-small"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="btn-secondary btn-small"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="card-editor-content">
                  <div className="editor-field">
                    <label>Note:</label>
                    <div className="note-title-display">{editingCard.noteTitle}</div>
                  </div>
                  <div className="editor-field">
                    <label>Direction:</label>
                    <div className="direction-display">
                      {editingCard.direction === 'back-to-front' ? 'Reverse (Back → Front)' : 'Normal (Front → Back)'}
                    </div>
                  </div>
                  <div className="editor-field">
                    <label>Front:</label>
                    <textarea
                      value={editingCard.front || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, front: e.target.value })}
                      rows={4}
                      className="card-edit-textarea"
                    />
                  </div>
                  <div className="editor-field">
                    <label>Back:</label>
                    <textarea
                      value={editingCard.back || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, back: e.target.value })}
                      rows={4}
                      className="card-edit-textarea"
                    />
                  </div>
                  {(editingCard.front_image || editingCard.back_image || editingCard.front_audio || editingCard.back_audio) && (
                    <div className="editor-field">
                      <label>Media:</label>
                      <div className="media-info">
                        {editingCard.front_image && <div>Front Image: {editingCard.front_image}</div>}
                        {editingCard.back_image && <div>Back Image: {editingCard.back_image}</div>}
                        {editingCard.front_audio && <div>Front Audio: {editingCard.front_audio}</div>}
                        {editingCard.back_audio && <div>Back Audio: {editingCard.back_audio}</div>}
                        <p className="media-note">Note: Media files cannot be edited here. Edit the flashcard note to change media.</p>
                      </div>
                    </div>
                  )}
                  {cards.find(c => c.parent_card_id === editingCard.id || c.id === editingCard.parent_card_id) && (
                    <div className="sync-notice">
                      <strong>Note:</strong> This card has a reverse card. Changes will be synced to both cards.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlashcardSettingsView;

