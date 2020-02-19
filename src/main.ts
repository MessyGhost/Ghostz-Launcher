import {BrowserWindow, app, dialog, ipcMain} from 'electron';
import * as path from 'path';

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000, height: 600, 
        resizable:false, 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            nodeIntegration: true,
            webviewTag: true
        }});
    //mainWindow.webContents.openDevTools();
    mainWindow.setMenu(null);

    mainWindow.loadFile('src/ui/index.html');
    mainWindow.show();
    mainWindow.on('close', event => {
        
    });
    ipcMain.on('request', async (event, arg) => {
        if(arg === 'gameDir') {
            await dialog.showOpenDialog({properties: ['openDirectory']}).then(
                value => {
                    event.returnValue = value.filePaths[0];
                }
            );
        }
    });
}

app.on('activate', () => {
    if(BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    app.quit();
});
