const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Folders
  folders: {
    getAll: () => ipcRenderer.invoke('folders:getAll'),
    getByParent: (parentId) => ipcRenderer.invoke('folders:getByParent', parentId),
    getAllUnfiltered: () => ipcRenderer.invoke('folders:getAllUnfiltered'),
    create: (data) => ipcRenderer.invoke('folders:create', data),
    update: (data) => ipcRenderer.invoke('folders:update', data),
    move: (data) => ipcRenderer.invoke('folders:move', data),
    delete: (id) => ipcRenderer.invoke('folders:delete', id)
  },
  
  // Notes with multi-parent support
  notes: {
    getAll: (params) => ipcRenderer.invoke('notes:getAll', params),
    getAllUnfiltered: () => ipcRenderer.invoke('notes:getAllUnfiltered'),
    getChildren: (parentNoteId) => ipcRenderer.invoke('notes:getChildren', parentNoteId),
    getParents: (childNoteId) => ipcRenderer.invoke('notes:getParents', childNoteId),
    getById: (id) => ipcRenderer.invoke('notes:getById', id),
    getByTitle: (title) => ipcRenderer.invoke('notes:getByTitle', title),
    search: (query) => ipcRenderer.invoke('notes:search', query),
    create: (data) => ipcRenderer.invoke('notes:create', data),
    update: (data) => ipcRenderer.invoke('notes:update', data),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    move: (data) => ipcRenderer.invoke('notes:move', data),
    getBacklinks: (title) => ipcRenderer.invoke('notes:getBacklinks', title)
  },
  
  // Cards with media support
  cards: {
    getAll: () => ipcRenderer.invoke('cards:getAll'),
    getDue: () => ipcRenderer.invoke('cards:getDue'),
    getDueCount: () => ipcRenderer.invoke('cards:getDueCount'),
    getByNote: (noteId) => ipcRenderer.invoke('cards:getByNote', noteId),
    create: (data) => ipcRenderer.invoke('cards:create', data),
    update: (card) => ipcRenderer.invoke('cards:update', card),
    delete: (id) => ipcRenderer.invoke('cards:delete', id)
  },
  
  // Media
  media: {
    add: (data) => ipcRenderer.invoke('media:add', data),
    getByNote: (noteId) => ipcRenderer.invoke('media:getByNote', noteId),
    delete: (id) => ipcRenderer.invoke('media:delete', id),
    uploadImage: (data) => ipcRenderer.invoke('media:uploadImage', data)
  },
  
  // Audio
  audio: {
    fetchFromForvo: (data) => ipcRenderer.invoke('audio:fetchFromForvo', data),
    listForvoPronunciations: (data) => ipcRenderer.invoke('audio:listForvoPronunciations', data),
    downloadForvoPronunciation: (data) => ipcRenderer.invoke('audio:downloadForvoPronunciation', data)
  },
  
  // Stats
  stats: {
    get: () => ipcRenderer.invoke('stats:get'),
    getSchedule: (days) => ipcRenderer.invoke('stats:getSchedule', days),
    getReviewHistory: (days) => ipcRenderer.invoke('stats:getReviewHistory', days),
    getHeatmapData: (daysBack, daysForward) => ipcRenderer.invoke('stats:getHeatmapData', daysBack, daysForward)
  },
  
  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (data) => ipcRenderer.invoke('settings:set', data)
  },
  
  // Maintenance
  maintenance: {
    fixOrphanedItems: () => ipcRenderer.invoke('fixOrphanedItems')
  },
  
  // Flashcard Templates
  templates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    create: (data) => ipcRenderer.invoke('templates:create', data),
    update: (data) => ipcRenderer.invoke('templates:update', data),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
    getById: (id) => ipcRenderer.invoke('templates:getById', id)
  },
  
  // Note Templates
  noteTemplates: {
    getAll: () => ipcRenderer.invoke('noteTemplates:getAll'),
    getById: (id) => ipcRenderer.invoke('noteTemplates:getById', id),
    create: (data) => ipcRenderer.invoke('noteTemplates:create', data),
    update: (data) => ipcRenderer.invoke('noteTemplates:update', data),
    delete: (id) => ipcRenderer.invoke('noteTemplates:delete', id),
    process: (data) => ipcRenderer.invoke('noteTemplates:process', data)
  },
  
  // Obsidian Import
  obsidian: {
    selectVault: () => ipcRenderer.invoke('obsidian:selectVault'),
    importVault: (vaultPath) => ipcRenderer.invoke('obsidian:importVault', vaultPath)
  }
});
