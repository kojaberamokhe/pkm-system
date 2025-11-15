import React, { useState, useEffect } from 'react';

function CardsView({ selectedNote, onUpdate }) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    loadCards();
  }, [selectedNote]);

  const loadCards = async () => {
    if (selectedNote) {
      const noteCards = await window.api.cards.getByNote(selectedNote.id);
      setCards(noteCards.filter(c => !c.is_reversed));
    } else {
      const all = await window.api.cards.getAll();
      setCards(all.filter(c => !c.is_reversed));
    }
  };

  return (
    <div className="cards-view">
      <div className="cards-header">
        <h2>
          {selectedNote ? `Cards for: ${selectedNote.title}` : 'All Flashcards'}
        </h2>
        <p className="cards-subtitle">
          {selectedNote 
            ? 'View flashcards created from this note. Edit flashcards by clicking on the flashcard note in the knowledge tree.'
            : 'View all flashcards. Edit flashcards by clicking on flashcard notes in the knowledge tree.'}
        </p>
      </div>

      <div className="cards-list">
        {cards.map(card => (
          <div key={card.id} className="card-item">
            <div className="card-content">
              <div className="card-side">
                <label>Front:</label>
                <div className="card-text">{card.front}</div>
                {card.front_image && (
                  <img src={`file://${card.front_image}`} alt="Front" className="card-media" />
                )}
                {card.front_audio && (
                  <audio controls src={`file://${card.front_audio}`} />
                )}
              </div>
              <div className="card-side">
                <label>Back:</label>
                <div className="card-text">{card.back}</div>
                {card.back_image && (
                  <img src={`file://${card.back_image}`} alt="Back" className="card-media" />
                )}
                {card.back_audio && (
                  <audio controls src={`file://${card.back_audio}`} />
                )}
              </div>
            </div>
            <div className="card-stats">
              <span>Reps: {card.reps || 0}</span>
              <span>Difficulty: {(card.difficulty || 0).toFixed(2)}</span>
              <span>Stability: {(card.stability || 0).toFixed(1)}d</span>
              {card.direction && <span>Direction: {card.direction}</span>}
            </div>
          </div>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="empty-state">
          <p>No flashcards yet. Create flashcard notes in the knowledge tree to generate flashcards.</p>
        </div>
      )}
    </div>
  );
}

export default CardsView;
