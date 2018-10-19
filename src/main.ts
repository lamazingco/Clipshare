import * as chokidar from "chokidar";
import { app, BrowserWindow, dialog, Notification } from "electron";
import * as fs from "fs";
import { OAuth2Client } from "google-auth-library";
import { google, drive_v3 } from "googleapis";
import * as mimeTypes from "mime-types";
import * as path from "path";
import { URL } from "url";
import * as clipboard from 'clipboardy'
import * as bitly from './bitly'
import { TrayMenu } from './TrayMenu';
const preferences = require('./Preferences')

const SCOPES = ['https://www.googleapis.com/auth/drive'];

let mainWindow: Electron.BrowserWindow;
let oAuth2Client: OAuth2Client;
let clipshareFolderId: string;
let trayMenu: TrayMenu;
let fileWatcher: chokidar.FSWatcher;
let drive: drive_v3.Drive;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    height: 600,
    width: 800
  });

  // load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, '../index.html'));

  authorizeWithGoogleDrive();

  // Open the DevTools.
  //mainWindow.webContents.openDevTools();

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
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it"s common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

function createTrayMenu() {
  trayMenu = new TrayMenu();
  trayMenu.createTrayMenu();
}

function authorizeWithGoogleDrive() {
  fs.readFile('.credentials.json', (err, content) => {
    if (err) {
      return console.log('Error loading client secret file:', err);
    }
    // Authorize a client with credentials, then call the Google Drive API.
    authorize(JSON.parse(content.toString()));
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials: any) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const savedToken = preferences.getToken();

  if (savedToken) {
    oAuth2Client.setCredentials(JSON.parse(savedToken));
    drive = google.drive({ version: 'v3', auth: oAuth2Client });
    openDirectoryDialog();
    getOrCreateClipshareFolder();
  } else {
    getAccessToken(oAuth2Client);
  }
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client: OAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  getTokenAfterUserAuthorized(authUrl);
  console.log('Loading auth URL: ', authUrl);
}

function getTokenAfterUserAuthorized(authUrl: string) {
  mainWindow.loadURL(authUrl);
  mainWindow.webContents.on('will-navigate', (ev: any, url: string) => {
    if (url.includes('approvalCode')) {
      // Get the approvalCode from URL params
      const parsed = new URL(url);
      const approvalCode = parsed.searchParams.get('approvalCode');
      console.log(approvalCode);

      oAuth2Client.getToken(approvalCode, (err: any, token: any) => {
        if (err) {
          return console.error('Error retrieving access token', err);
        }
        if (token) {
          oAuth2Client.setCredentials(token);
          console.log('oAuth set credentials with token: ', token);
        }
        // Store the token to disk for later program executions
        preferences.saveToken(JSON.stringify(token));
        drive = google.drive({ version: 'v3', auth: oAuth2Client });
      });
      openDirectoryDialog();
    }
  });
}

function openDirectoryDialog() {
  const screenshotsDirectory = preferences.getScreenshotsDirectory();
  if (screenshotsDirectory) {
    startWatcher(screenshotsDirectory);
  } else {
    dialog.showOpenDialog(
      mainWindow,
      {
        properties: ['openDirectory']
      },
      path => {
        preferences.saveScreenshotsDirectory(path[0]);
        startWatcher(path[0]);
      }
    );
  }
  monitorWatcherDirectoryChange();
}

function monitorWatcherDirectoryChange() {
  let currentScreenshotsPath = preferences.getScreenshotsDirectory();
  preferences.preferences.on('save', (prefs: any) => {
    console.log('Prefs were saved');
    if (preferences.getScreenshotsDirectory() != currentScreenshotsPath) {
      currentScreenshotsPath = preferences.getScreenshotsDirectory();
      fileWatcher.close();
      startWatcher(currentScreenshotsPath);
    }
  })
}

function startWatcher(screenshotsPath: string) {
  console.log('watching', screenshotsPath, 'for new files');

  fileWatcher = chokidar.watch(screenshotsPath, {
    persistent: true,
    ignored: /[\/\\]\./,
    awaitWriteFinish: {
      stabilityThreshold: 100
    }
  });

  var isReady = false;
  fileWatcher.on('ready', () => {
    isReady = true;
  })
    .on('add', filePath => {
      if (isReady) {
        console.log('file added: ', filePath);
        handleNewFile(filePath);
      }
    });
}

function handleNewFile(filePath: string) {
    if (!isFileAScreenshot(filePath)) {
      return;
    }

    Promise.resolve()
    .then(() => uploadFileToGDrive(filePath))
    .then((fileId) => makeDriveFilePublic(fileId))
    .then((fileId) => buildDriveFileUrlWithId(fileId))
    .then((filePublicUrl) => bitly.shortenUrl(filePublicUrl))
    .then((shortUrl) => saveScreenshotToClipboard(shortUrl))
    .then((shortUrl) => showNotification("Screenshot copied to clipboard", shortUrl));
}

function isFileAScreenshot(filePath: string): boolean {
  return getFileMimeType(filePath).includes('image');
}

function getFileMimeType(filePath: string): string {
  return mimeTypes.lookup(filePath) || '';
}

function uploadFileToGDrive(filePath: string): Promise<string> {
  console.log('Adding new file to google drive.');
  const fileName = path.basename(filePath);
  const mimeType = getFileMimeType(filePath);

  return new Promise((resolve) => {
    drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
        parents: [clipshareFolderId]
      }, media: {
        mediaType: mimeType,
        body: fs.createReadStream(filePath)
      }
    }, (error, axiosResponse) => {
      if (error) {
        console.log(error);
      } else {
        console.log('File id:', axiosResponse.data);
        const fileId = axiosResponse.data.id;
        resolve(fileId);
      }
    });
  })
}

function makeDriveFilePublic(fileId: string): Promise<string> {
  return new Promise((resolve) => {
    drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
        allowFileDiscovery: false
      }
    }, function (error, result) {
      if (error) {
        console.log(error);
      } else {
        resolve(fileId);


      }
    });
  })
}

function buildDriveFileUrlWithId(fileId: string): Promise<string> {
  return new Promise((resolve) => {
    const filePublicUrl = 'https://drive.google.com/uc?export=view&id=' + fileId;
    console.log('public url: ', filePublicUrl);
    resolve(filePublicUrl);
  })
}

function saveScreenshotToClipboard(shortUrl: string): Promise<string> {
  return new Promise((resolve) => {
    clipboard.write(shortUrl);
    resolve(shortUrl);
  });
}

function showNotification(title: string, message: string) {
  if (Notification.isSupported) {
    new Notification({
      title: title,
      body: message,
    }).show();
  }
}

function getOrCreateClipshareFolder() {
  console.log("checking if clipshare folder exists");
  drive.files.list({
    q: 'name contains "clipshare" and trashed=false'
  }, (error, result) => {
    if (error) {
      console.log('Error while searching for clipshare folder: ', error);
    } else {
      console.log("successfully checked if clipshare folder exists");
      const files = result.data.files;
      if (files.length) {
        clipshareFolderId = files[0].id;
        console.log("Files: ");
        files.map((file) => {
          console.log(`${file.name} (${file.id})`);
        })
      } else {
        createClipshareFolder();
      }
    }
  })
}

function createClipshareFolder() {
  console.log('creating clipshare folder');
  drive.files.create({
    requestBody: {
      name: 'Clipshare',
      mimeType: 'application/vnd.google-apps.folder'
    }
  }, (error, result) => {
    if (error) {
      console.log('failed creating clipshare folder:', error);
    } else {
      clipshareFolderId = result.data.id;
      console.log('folder created: ', result.data.name, result.data.id);
    }
  })
}
