const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
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

// ============================
// AUTO-UPDATER
// ============================
function setupAutoUpdater() {
  // Configure updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Enable logging for debugging update issues
  autoUpdater.logger = require('electron').app.isPackaged ? null : console;

  autoUpdater.on('checking-for-update', () => {
    console.log('Auto-updater: checking for updates...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Auto-updater: update available -', info.version);
    sendUpdateStatus('available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Auto-updater: up to date -', info.version);
    sendUpdateStatus('up-to-date');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Auto-updater: update downloaded -', info.version);
    sendUpdateStatus('ready', {
      version: info.version
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error.message);
    sendUpdateStatus('error', {
      message: error.message
    });
  });

  // Check for updates after a short delay so the window is ready
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.log('Auto-update check failed (this is normal in dev):', err.message);
    });
  }, 3000);

  // Check for updates every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 30 * 60 * 1000);
}

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

// IPC handlers for update actions
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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

  // Start auto-updater after window is created
  setupAutoUpdater();
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
      const raw = fs.readFileSync(dataPath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        return { success: true, data: parsed };
      } catch (parseError) {
        console.error('Corrupted data file, attempting backup recovery:', parseError);
        // Try loading backup
        const backupPath = path.join(userDataPath, 'queuetrack-data.backup.json');
        if (fs.existsSync(backupPath)) {
          try {
            const backupRaw = fs.readFileSync(backupPath, 'utf-8');
            const backupData = JSON.parse(backupRaw);
            // Restore from backup
            fs.writeFileSync(dataPath, backupRaw, 'utf-8');
            return { success: true, data: backupData, recovered: true };
          } catch (backupError) {
            console.error('Backup also corrupted:', backupError);
          }
        }
        return { success: true, data: { version: 1, tests: [] }, corrupted: true };
      }
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
    
    const defaultSettings = { juicePercent: 10, juiceAnchor: 50000, darkMode: false, rowSize: 'normal', groups: {} };
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        return { success: true, data: { ...defaultSettings, ...parsed } };
      } catch (parseError) {
        console.error('Corrupted settings file, using defaults:', parseError);
        return { success: true, data: defaultSettings };
      }
    }
    return { success: true, data: defaultSettings };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
