import React, { useState, useEffect, useCallback } from 'react';
import { calculateNextReview } from '../utils/fsrs';

const FIELD_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
  FORVO_AUDIO: 'forvo_audio'
};

function ReviewView({ onUpdate, onExit }) {
  const [dueCards, setDueCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [frontFields, setFrontFields] = useState([]);
  const [backFields, setBackFields] = useState([]);
  const [reviewFontFamily, setReviewFontFamily] = useState('');
  const [reviewFontSize, setReviewFontSize] = useState(24);
  const [reviewBackFontSize, setReviewBackFontSize] = useState(18);

  useEffect(() => {
    loadDueCards();
    loadReviewSettings();
    // Reload cards when window gains focus (in case settings changed)
    const handleFocus = () => {
      loadDueCards();
      loadReviewSettings();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const loadReviewSettings = async () => {
    const fontFamily = await window.api.settings.get('review_font_family');
    const fontSize = await window.api.settings.get('review_font_size');
    const backFontSize = await window.api.settings.get('review_back_font_size');
    
    if (fontFamily) setReviewFontFamily(fontFamily);
    if (fontSize) setReviewFontSize(parseInt(fontSize) || 24);
    if (backFontSize) setReviewBackFontSize(parseInt(backFontSize) || 18);
  };

  useEffect(() => {
    if (currentCard) {
      loadCardFields();
    }
  }, [currentCard]);

  const loadCardFields = async () => {
    if (!currentCard?.note_id) {
      // Fallback to simple display if no note_id
      setFrontFields([]);
      setBackFields([]);
      return;
    }

    const cardDirection = currentCard.direction || 'front-to-back';
    const isReversed = cardDirection === 'back-to-front';

    try {
      const note = await window.api.notes.getById(currentCard.note_id);
      if (note?.content) {
        try {
          const contentData = JSON.parse(note.content);
          if (contentData.fields && Array.isArray(contentData.fields)) {
            // Parse fields from note content
            const fields = contentData.fields;
            let front = fields.filter(f => f.front);
            let back = fields.filter(f => f.back);
            
            // If this is a back-to-front card, swap front and back
            if (isReversed) {
              [front, back] = [back, front];
            }
            
            setFrontFields(front);
            setBackFields(back);
            return;
          }
        } catch (e) {
          // Not JSON or doesn't have fields structure
        }
      }
    } catch (error) {
      console.error('Failed to load note fields:', error);
    }

    // Fallback: use card data directly
    setFrontFields([]);
    setBackFields([]);
  };

  const loadDueCards = async () => {
    const cards = await window.api.cards.getDue();
    setDueCards(cards);
    if (cards.length > 0) {
      setCurrentCard(cards[0]);
    }
  };

  const handleRating = useCallback(async (rating) => {
    if (!currentCard) return;
    
    // Map to FSRS v6 ratings: Fail = 1 (Again), Pass = 4 (Easy)
    // rating parameter: 1 = Fail, 4 = Pass
    const fsrsRating = rating === 1 ? 1 : 4; // Fail -> Again (1), Pass -> Easy (4)
    
    const updated = await calculateNextReview(currentCard, fsrsRating);
    await window.api.cards.update(updated);
    
    // Check if burying sibling cards is enabled
    const burySiblings = await window.api.settings.get('bury_sibling_cards');
    if (burySiblings === 'true' && currentCard.note_id) {
      // Find sibling card: same note_id, opposite direction
      // Get all cards for this note to find the sibling
      const allNoteCards = await window.api.cards.getByNote(currentCard.note_id);
      
      const currentDirection = currentCard.direction || 'front-to-back';
      const oppositeDirection = currentDirection === 'front-to-back' ? 'back-to-front' : 'front-to-back';
      
      // Find the sibling card with opposite direction
      const siblingCard = allNoteCards.find(c => 
        c.id !== currentCard.id && 
        (c.direction === oppositeDirection || 
         (currentDirection === 'front-to-back' && c.direction === 'back-to-front') ||
         (currentDirection === 'back-to-front' && c.direction === 'front-to-back'))
      );
      
      if (siblingCard) {
        // Bury sibling card until tomorrow at midnight
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const buriedUntil = tomorrow.toISOString();
        
        console.log('Burying sibling card:', {
          siblingId: siblingCard.id,
          siblingDirection: siblingCard.direction,
          currentId: currentCard.id,
          currentDirection: currentDirection,
          buriedUntil: buriedUntil
        });
        
        await window.api.cards.update({
          id: siblingCard.id,
          buried_until: buriedUntil
        });
      } else {
        console.log('No sibling card found. Current card:', {
          id: currentCard.id,
          direction: currentDirection,
          note_id: currentCard.note_id
        });
        console.log('All note cards:', allNoteCards.map(c => ({ 
          id: c.id, 
          direction: c.direction, 
          parent_card_id: c.parent_card_id 
        })));
      }
    }
    
    setReviewCount(prev => prev + 1);
    
    // Reload due cards to get updated list (in case sibling was buried)
    const updatedCards = await window.api.cards.getDue();
    const remaining = updatedCards.filter(c => c.id !== currentCard.id);
    
    if (remaining.length > 0) {
      setCurrentCard(remaining[0]);
      setDueCards(remaining);
      setShowAnswer(false);
      setFrontFields([]);
      setBackFields([]);
    } else {
      setCurrentCard(null);
      setDueCards([]);
      setFrontFields([]);
      setBackFields([]);
      onUpdate();
    }
  }, [currentCard, onUpdate]);

  // Keyboard shortcuts - must be after handleRating is defined
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't handle if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Space to show answer or mark as Pass
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (!showAnswer) {
          setShowAnswer(true);
        } else if (currentCard) {
          handleRating(4); // Pass
        }
      }
      // F for Fail
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey && showAnswer && currentCard) {
        e.preventDefault();
        handleRating(1); // Fail
      }
      // P for Pass
      if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey && showAnswer && currentCard) {
        e.preventDefault();
        handleRating(4); // Pass
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showAnswer, currentCard, handleRating]);

  const renderField = (field, isFront) => {
    if (field.type === FIELD_TYPES.TEXT && field.value) {
      const fontSize = isFront ? reviewFontSize : reviewBackFontSize;
      const style = {
        fontSize: `${fontSize}px`,
        fontFamily: reviewFontFamily || 'inherit'
      };
      return (
        <div 
          key={field.id || `text-${field.value.substring(0, 10)}`} 
          className="review-field review-field-text"
          style={style}
        >
          {field.value}
        </div>
      );
    }
    if (field.type === FIELD_TYPES.IMAGE && field.value) {
      return (
        <div key={field.id || `image-${field.value}`} className="review-field review-field-image">
          <img src={field.value.startsWith('file://') ? field.value : `file://${field.value}`} alt="Card" />
        </div>
      );
    }
    if ((field.type === FIELD_TYPES.AUDIO || field.type === FIELD_TYPES.FORVO_AUDIO) && field.value) {
      // Handle different URL formats: pkm-media://, file://, http://, https://, or plain file paths
      let audioSrc = field.value;
      if (!audioSrc.startsWith('pkm-media://') && 
          !audioSrc.startsWith('file://') && 
          !audioSrc.startsWith('http://') && 
          !audioSrc.startsWith('https://')) {
        // Plain file path, prepend file://
        audioSrc = `file://${audioSrc}`;
      }
      return (
        <div key={field.id || `audio-${field.value}`} className="review-field review-field-audio">
          <audio controls src={audioSrc} autoPlay={isFront} />
        </div>
      );
    }
    return null;
  };

  const renderCardSide = (fields, cardData, isFront) => {
    const cardDirection = cardData.direction || 'front-to-back';
    const isReversed = cardDirection === 'back-to-front';
    
    // If we have parsed fields, render them individually
    if (fields.length > 0) {
      return fields.map(field => renderField(field, isFront)).filter(Boolean);
    }
    
    // Fallback: render from card data
    // For back-to-front cards, swap what we show as front/back
    const elements = [];
    if (isFront) {
      // Show front side - for reversed cards, this is actually the back content
      const displayFront = isReversed ? cardData.back : cardData.front;
      const displayFrontImage = isReversed ? cardData.back_image : cardData.front_image;
      const displayFrontAudio = isReversed ? cardData.back_audio : cardData.front_audio;
      
        if (displayFront) {
          const style = {
            fontSize: `${reviewFontSize}px`,
            fontFamily: reviewFontFamily || 'inherit'
          };
          elements.push(
            <div key="front-text" className="review-field review-field-text" style={style}>
              {displayFront}
            </div>
          );
        }
      if (displayFrontImage) {
        elements.push(
          <div key="front-image" className="review-field review-field-image">
            <img src={`file://${displayFrontImage}`} alt="Front" />
          </div>
        );
      }
      if (displayFrontAudio) {
        // Handle different URL formats: pkm-media://, file://, http://, https://, or plain file paths
        let audioSrc = displayFrontAudio;
        if (!audioSrc.startsWith('pkm-media://') && 
            !audioSrc.startsWith('file://') && 
            !audioSrc.startsWith('http://') && 
            !audioSrc.startsWith('https://')) {
          // Plain file path, prepend file://
          audioSrc = `file://${audioSrc}`;
        }
        elements.push(
          <div key="front-audio" className="review-field review-field-audio">
            <audio controls src={audioSrc} autoPlay />
          </div>
        );
      }
    } else {
      // Show back side - for reversed cards, this is actually the front content
      const displayBack = isReversed ? cardData.front : cardData.back;
      const displayBackImage = isReversed ? cardData.front_image : cardData.back_image;
      const displayBackAudio = isReversed ? cardData.front_audio : cardData.back_audio;
      
      if (displayBack) {
        const style = {
          fontSize: `${reviewBackFontSize}px`,
          fontFamily: reviewFontFamily || 'inherit'
        };
        elements.push(
          <div key="back-text" className="review-field review-field-text" style={style}>
            {displayBack}
          </div>
        );
      }
      if (displayBackImage) {
        elements.push(
          <div key="back-image" className="review-field review-field-image">
            <img src={`file://${displayBackImage}`} alt="Back" />
          </div>
        );
      }
      if (displayBackAudio) {
        // Handle different URL formats: pkm-media://, file://, http://, https://, or plain file paths
        let audioSrc = displayBackAudio;
        if (!audioSrc.startsWith('pkm-media://') && 
            !audioSrc.startsWith('file://') && 
            !audioSrc.startsWith('http://') && 
            !audioSrc.startsWith('https://')) {
          // Plain file path, prepend file://
          audioSrc = `file://${audioSrc}`;
        }
        elements.push(
          <div key="back-audio" className="review-field review-field-audio">
            <audio controls src={audioSrc} autoPlay />
          </div>
        );
      }
    }
    return elements;
  };

  if (!currentCard) {
    return (
      <div className="review-view empty">
        <div className="review-empty-state">
          <h2>🎉 All caught up!</h2>
          <p>No cards due for review right now.</p>
          {reviewCount > 0 && <p className="review-session-count">You reviewed {reviewCount} cards this session.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="review-view">
      <div className="review-header">
        <div className="review-header-stats">
          <div className="review-header-item">
            <span className="review-header-label">Cards Remaining</span>
            <span className="review-header-value">{dueCards.length}</span>
          </div>
          <div className="review-header-item">
            <span className="review-header-label">Reviewed</span>
            <span className="review-header-value">{reviewCount}</span>
          </div>
        </div>
      </div>

      <div className="review-card">
        <div className="card-front">
          {renderCardSide(frontFields, currentCard, true)}
        </div>

        {showAnswer && (
          <div className="card-back">
            {renderCardSide(backFields, currentCard, false)}
          </div>
        )}
      </div>

      <div className="review-actions">
        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="btn-primary btn-large">
            Show Answer (Space)
          </button>
        ) : (
          <div className="rating-buttons rating-buttons-two">
            <button onClick={() => handleRating(1)} className="btn-fail">
              Fail (F)
            </button>
            <button onClick={() => handleRating(4)} className="btn-good">
              Pass (Space/P)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewView;
