const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow;
let projectorWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        width: 1280,
        height: 800,
        title: 'ytka',
        backgroundColor: '#000000', // Cyberpunk black
        titleBarStyle: 'hidden', // Custom frame if we want
        titleBarOverlay: {
            color: '#000000',
            symbolColor: '#00fff5'
        },
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // For simple <webview> usage in this prototype
            webviewTag: true // CRITICAL: Enables <webview>
        }
    });

    // In dev, wait for Vite to start then load URL
    // In prod, load index.html
    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    // Optional: Open DevTools
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (projectorWindow) {
            projectorWindow.close();
        }
    });
}

// IPC: Toggle Projector
ipcMain.on('toggle-projector', (event, arg) => {
    if (projectorWindow) {
        projectorWindow.close();
        projectorWindow = null;
        event.reply('projector-status', false);
        return;
    }

    const displays = screen.getAllDisplays();
    const externalDisplay = displays.find((display) => {
        return display.bounds.x !== 0 || display.bounds.y !== 0;
    });

    let displayToUse = externalDisplay || screen.getPrimaryDisplay();

    projectorWindow = new BrowserWindow({
        x: displayToUse.bounds.x + 50,
        y: displayToUse.bounds.y + 50,
        width: 1000,
        height: 600,
        fullscreen: !!externalDisplay, // Fullscreen ONLY if external
        fullscreen: !!externalDisplay, // Fullscreen ONLY if external
        title: 'ytka - Projector',
        backgroundColor: '#000000',
        frame: !externalDisplay, // Show frame if windowed (single monitor)
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
        }
    });

    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
    // Load same app but with query param
    projectorWindow.loadURL(startUrl + '#/projector?mode=projector');

    projectorWindow.on('closed', () => {
        projectorWindow = null;
        if (mainWindow) {
            mainWindow.webContents.send('projector-status', false);
        }
    });

    event.reply('projector-status', true);
});

// IPC: Relay State (Controller -> Projector)
ipcMain.on('sync-state', (event, state) => {
    if (projectorWindow) {
        projectorWindow.webContents.send('sync-state', state);
    }
});

// IPC: Relay Time/Progress (Projector -> Controller)
ipcMain.on('sync-time', (event, data) => {
    if (mainWindow) {
        mainWindow.webContents.send('sync-time', data);
    }
});

// IPC: Relay Commands (Controller -> Projector)
// e.g. Seek, etc. directly to webview if needed, or via state sync
ipcMain.on('remote-command', (event, command) => {
    if (projectorWindow) {
        projectorWindow.webContents.send('remote-command', command);
    }
});

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
