const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  dialog.showErrorBox('Application Error', 
    'An unexpected error occurred. The application will continue running.\n\n' +
    'Error: ' + error.message);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: process.env.NODE_ENV === 'development'
    },
    backgroundColor: '#667eea',
    show: false,
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('index.html');

  // Show window when ready with fade effect
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle window errors
  mainWindow.webContents.on('crashed', () => {
    const options = {
      type: 'error',
      title: 'Application Crashed',
      message: 'QueueTrack has crashed. Would you like to restart?',
      buttons: ['Restart', 'Close']
    };
    
    dialog.showMessageBox(options).then((result) => {
      if (result.response === 0) {
        app.relaunch();
        app.quit();
      }
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Remove menu in production
  if (process.env.NODE_ENV !== 'development') {
    mainWindow.setMenu(null);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// File Operations
ipcMain.handle('select-csv-file', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      title: 'Select CSV File to Import'
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('File selection error:', error);
    return null;
  }
});

ipcMain.handle('read-csv-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // Check file size (limit to 50MB)
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    const maxSizeMB = 50;

    if (fileSizeMB > maxSizeMB) {
      return {
        success: false,
        error: `File too large (${fileSizeMB.toFixed(1)}MB). Maximum size is ${maxSizeMB}MB.`
      };
    }

    // Check if file is empty
    if (stats.size === 0) {
      return { success: false, error: 'File is empty' };
    }

    const data = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data };
  } catch (error) {
    console.error('File read error:', error);
    return { success: false, error: error.message };
  }
});

// Data Storage
ipcMain.handle('save-data', async (event, data) => {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dataPath = path.join(userDataPath, 'queuetrack-data.json');
    
    // Create backup before saving
    if (fs.existsSync(dataPath)) {
      const backupPath = path.join(userDataPath, 'queuetrack-data.backup.json');
      fs.copyFileSync(dataPath, backupPath);
    }
    
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Data save error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-data', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const dataPath = path.join(userDataPath, 'queuetrack-data.json');

    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    // Return empty data with schema version
    return { success: true, data: { version: 1, tests: [] } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Settings
ipcMain.handle('save-settings', async (event, settings) => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-settings', async () => {
  try {
    const userDataPath = app.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { success: true, data: JSON.parse(data) };
    }
    return { success: true, data: { juicePercent: 10, juiceAnchor: 50000, darkMode: false } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
