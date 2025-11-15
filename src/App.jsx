import React, { useState, useEffect } from 'react';
import { FileText, FolderOpen, Settings, BarChart3, GraduationCap, Sliders, Calendar } from 'lucide-react';
import Sidebar from './components/Sidebar';
import NoteEditor from './components/NoteEditor';
import ReviewView from './components/ReviewView';
import StatsView from './components/StatsView';
import HeatmapView from './components/HeatmapView';
import SettingsView from './components/SettingsView';
import FlashcardSettingsView from './components/FlashcardSettingsView';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('notes');
  const [selectedNote, setSelectedNote] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [stats, setStats] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [sidebarRefresh, setSidebarRefresh] = useState(0);
  const [dueCardsCount, setDueCardsCount] = useState(0);
  const [reviewViewKey, setReviewViewKey] = useState(0);

  useEffect(() => {
    // Set default theme immediately to prevent color issues
    document.documentElement.setAttribute('data-theme', 'dark');
    
    loadStats();
    loadTheme();
    loadFontSettings();
    loadDueCardsCount();
    // Refresh due cards count periodically
    const interval = setInterval(loadDueCardsCount, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, []);
  
  const loadDueCardsCount = async () => {
    try {
      const count = await window.api.cards.getDueCount();
      setDueCardsCount(count);
    } catch (error) {
      console.error('Failed to load due cards count:', error);
    }
  };
  
  const reloadReviewView = () => {
    setReviewViewKey(prev => prev + 1);
  };
  
  // Reload review view when switching to it (to apply any setting changes)
  useEffect(() => {
    if (currentView === 'review') {
      reloadReviewView();
    }
  }, [currentView]);
  
  const loadFontSettings = async () => {
    const savedFontFamily = await window.api.settings.get('font_family');
    const savedFontSize = await window.api.settings.get('font_size_base');
    const root = document.documentElement;
    
    if (savedFontFamily) {
      root.style.setProperty('--font-family', savedFontFamily);
    }
    if (savedFontSize) {
      const size = parseInt(savedFontSize) || 14;
      root.style.setProperty('--font-size-base', `${size}px`);
      root.style.setProperty('--font-size-small', `${Math.max(10, size - 2)}px`);
      root.style.setProperty('--font-size-large', `${size + 2}px`);
    }
  };

  const loadStats = async () => {
    const data = await window.api.stats.get();
    setStats(data);
  };

  const loadTheme = async () => {
    const savedTheme = await window.api.settings.get('theme');
    const themeToUse = savedTheme || 'dark'; // Default to dark if no saved theme
    setTheme(themeToUse);
    document.documentElement.setAttribute('data-theme', themeToUse);
  };

  const handleNoteSelect = async (noteOrId) => {
    if (!noteOrId) {
      setSelectedNote(null);
      return;
    }

    let note;
    if (typeof noteOrId === 'object' && noteOrId !== null) {
      note = noteOrId;
    } else {
      note = await window.api.notes.getById(noteOrId);
    }
    if (note) {
      setSelectedNote(note);
      setCurrentView('notes');
    }
  };

  const handleFolderSelect = (folderId) => {
    setSelectedFolder(folderId);
    setSelectedNote(null);
  };

  const handleNoteUpdate = async () => {
    await loadStats();
    if (selectedNote) {
      const updated = await window.api.notes.getById(selectedNote.id);
      setSelectedNote(updated);
    }
    // Refresh sidebar to show updated note relationships
    setSidebarRefresh(prev => prev + 1);
  };

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    await window.api.settings.set({ key: 'theme', value: newTheme });
  };

  return (
    <div className="app">
      <div className="titlebar">
        <div className="titlebar-left">
        </div>
        <div className="titlebar-center">
          <span className="app-title">PKM System</span>
        </div>
        <div className="titlebar-right">
          <button className="titlebar-btn" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      <div className="main-container">
        <Sidebar
          onNoteSelect={handleNoteSelect}
          refreshTrigger={sidebarRefresh}
          currentNote={selectedNote}
        />

        <div className="content-area">
          <div className="view-tabs">
              <button
                className={`tab ${currentView === 'notes' ? 'active' : ''}`}
                onClick={() => setCurrentView('notes')}
            >
              <FileText size={18} />
              <span>Notes</span>
            </button>
            <button
              className={`tab ${currentView === 'review' ? 'active' : ''}`}
              onClick={() => setCurrentView('review')}
            >
              <GraduationCap size={18} />
              <span>Flashcard Review</span>
              {dueCardsCount > 0 && (
                <span className="badge">{dueCardsCount}</span>
              )}
            </button>
            <button
              className={`tab ${currentView === 'stats' ? 'active' : ''}`}
              onClick={() => setCurrentView('stats')}
            >
              <BarChart3 size={18} />
              <span>Stats</span>
            </button>
            <button
              className={`tab ${currentView === 'heatmap' ? 'active' : ''}`}
              onClick={() => setCurrentView('heatmap')}
            >
              <Calendar size={18} />
              <span>Heatmap</span>
            </button>
            <button
              className={`tab ${currentView === 'flashcard-settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('flashcard-settings')}
            >
              <Sliders size={18} />
              <span>Flashcard Settings</span>
            </button>
            <button
              className={`tab ${currentView === 'settings' ? 'active' : ''}`}
              onClick={() => setCurrentView('settings')}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </div>

          <div className="view-content">
            {currentView === 'notes' && (
              <NoteEditor
                note={selectedNote}
                onSave={handleNoteUpdate}
                onDelete={() => {
                  setSelectedNote(null);
                  handleNoteUpdate();
                }}
                onNoteSelect={handleNoteSelect}
              />
            )}
            {currentView === 'review' && (
              <ReviewView 
                key={reviewViewKey}
                onUpdate={() => { loadStats(); loadDueCardsCount(); }}
                onExit={() => setCurrentView('notes')}
              />
            )}
            {currentView === 'stats' && (
              <StatsView stats={stats} />
            )}
            {currentView === 'heatmap' && (
              <HeatmapView />
            )}
            {currentView === 'flashcard-settings' && (
              <FlashcardSettingsView 
                onUpdate={() => { 
                  loadStats(); 
                  loadDueCardsCount();
                  // Always reload review view to apply settings changes
                  reloadReviewView();
                }} 
                onNoteSelect={handleNoteSelect}
              />
            )}
            {currentView === 'settings' && (
              <SettingsView 
                onNoteSelect={handleNoteSelect} 
                onFolderSelect={(folderId) => {
                  // Refresh sidebar to show the folder
                  setSidebarRefresh(prev => prev + 1);
                  // Switch back to notes view to see the sidebar
                  setCurrentView('notes');
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
