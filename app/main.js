"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chokidar = require("chokidar");
const electron_1 = require("electron");
const fs = require("fs");
const googleapis_1 = require("googleapis");
const mimeTypes = require("mime-types");
const path = require("path");
const url_1 = require("url");
const bitly_1 = require("bitly/dist/bitly");
const clipboard = require("clipboardy");
const bitlyClient = new bitly_1.BitlyClient('9d94c5f5c8e3ee44310e2da016e8dd47eb5957ff');
const TrayMenu_1 = require("./TrayMenu");
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
let mainWindow;
let oAuth2Client;
let clipshareFolderId;
let trayMenu;
function createWindow() {
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        height: 600,
        width: 800
    });
    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, '../index.html'));
    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
        if (err) {
            return console.log('Error loading client secret file:', err);
        }
        // Authorize a client with credentials, then call the Google Drive API.
        authorize(JSON.parse(content.toString()), null);
    });
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
    mainWindow.webContents.on('will-navigate', (ev, url) => {
        if (url.includes('approvalCode')) {
            // Get the approvalCode from URL params
            const parsed = new url_1.URL(url);
            const approvalCode = parsed.searchParams.get('approvalCode');
            console.log(approvalCode);
            mainWindow.close();
            oAuth2Client.getToken(approvalCode, (err, token) => {
                if (err) {
                    return console.error('Error retrieving access token', err);
                }
                if (token) {
                    oAuth2Client.setCredentials(token);
                    console.log('oAuth set credentials with token: ', token);
                }
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), err => {
                    if (err) {
                        console.error(err);
                    }
                    console.log('Token stored to', TOKEN_PATH);
                });
            });
            openDirectoryDialog();
        }
    });
    createTrayMenu();
    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
electron_1.app.on('ready', createWindow);
// Quit when all windows are closed.
electron_1.app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    // On OS X it"s common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});
function createTrayMenu() {
    trayMenu = new TrayMenu_1.TrayMenu();
    trayMenu.createTrayMenu();
}
/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    oAuth2Client = new googleapis_1.google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
            return getAccessToken(oAuth2Client, callback);
        }
        oAuth2Client.setCredentials(JSON.parse(token.toString()));
        openDirectoryDialog();
        getOrCreateClipshareFolder();
        if (callback) {
            callback(oAuth2Client);
        }
    });
}
/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    mainWindow.loadURL(authUrl);
    console.log('Loading auth URL: ', authUrl);
}
function openDirectoryDialog() {
    electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    }, path => {
        mainWindow.close();
        startWatcher(path[0]);
    });
}
function startWatcher(path) {
    console.log('watching', path, 'for new files');
    const watcher = chokidar.watch(path, {
        persistent: true,
        ignored: /[\/\\]\./,
        awaitWriteFinish: {
            stabilityThreshold: 500
        }
    });
    var isReady = false;
    watcher.on('ready', () => {
        isReady = true;
    })
        .on('add', filePath => {
        if (isReady) {
            console.log('file added: ', filePath);
            addFileToGDrive(filePath);
        }
    });
}
function addFileToGDrive(filePath) {
    console.log('Adding new file to google drive.');
    const fileName = path.basename(filePath);
    // empty mimeType when type is unknown 
    const mimeType = mimeTypes.lookup(filePath) || '';
    console.log('mimeType: ', mimeType);
    if (!mimeType.includes('image')) {
        // uploading only screenshots
        return;
    }
    const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
    drive.files.create({
        requestBody: {
            name: fileName,
            mimeType: mimeType,
            parents: [clipshareFolderId]
        }, media: {
            mediaType: mimeType,
            body: fs.createReadStream(filePath)
        }
    }, (err, axiosResponse) => {
        if (err) {
            console.log(err);
        }
        else {
            console.log('File id:', axiosResponse.data);
            const fileId = axiosResponse.data.id;
            // create reader permissions to anyone
            drive.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: "reader",
                    type: "anyone",
                    allowFileDiscovery: false
                }
            }, function (err, result) {
                if (err) {
                    console.log(err);
                }
                else {
                    const filePublicUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
                    console.log('public url: ', filePublicUrl);
                    shortenUrl(filePublicUrl);
                }
            });
        }
    });
}
function shortenUrl(longUrl) {
    bitlyClient.shorten(longUrl)
        .then((result) => {
        console.log(result.url);
        saveScreenshotToClipboard(result.url);
    }).catch((error) => {
        console.log(error);
    });
}
function saveScreenshotToClipboard(url) {
    clipboard.writeSync(url);
    showNotification('Screenshot copied to clipboard', url);
}
function showNotification(title, message) {
    if (electron_1.Notification.isSupported) {
        new electron_1.Notification({
            title: title,
            body: message,
        }).show();
    }
}
function getOrCreateClipshareFolder() {
    console.log("checking if clipshare folder exists");
    const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
    drive.files.list({
        q: 'name contains "clipshare" and trashed=false'
    }, (error, result) => {
        if (error) {
            console.log('Error while searching for clipshare folder: ', error);
        }
        else {
            console.log("successfully checked if clipshare folder exists");
            const files = result.data.files;
            if (files.length) {
                clipshareFolderId = files[0].id;
                console.log("Files: ");
                files.map((file) => {
                    console.log(`${file.name} (${file.id})`);
                });
            }
            else {
                createClipshareFolder();
            }
        }
    });
}
function createClipshareFolder() {
    console.log('creating clipshare folder');
    const drive = googleapis_1.google.drive({ version: 'v3', auth: oAuth2Client });
    drive.files.create({
        requestBody: {
            name: 'Clipshare',
            mimeType: 'application/vnd.google-apps.folder'
        }
    }, (error, result) => {
        if (error) {
            console.log('failed creating clipshare folder:', error);
        }
        else {
            clipshareFolderId = result.data.id;
            console.log('folder created: ', result.data.name, result.data.id);
        }
    });
}
//# sourceMappingURL=main.js.map