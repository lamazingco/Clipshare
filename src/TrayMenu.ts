import { Tray, Menu, nativeImage, NativeImage } from 'electron'
const platform = require('os').platform()
const imageFolder = './assets/icons'
const preferences = require('./Preferences')

export class TrayMenu extends Tray {
    constructor() {
        super(getTrayIcon());
    }

    createTrayMenu() {
        if (platform == 'darwin') {
            const iconPath = imageFolder + '/osx/trayHighlight.png';
            this.setPressedImage(nativeImage.createFromPath(iconPath));
        }
        this.setToolTip('ClipChare');
        this.setContextMenu(getTrayMenu());
    }
}

function getTrayIcon() {
    return nativeImage.createFromPath(getTrayIconPath());
}

function getTrayIconPath() {
    if (platform == 'darwin') {
        // *nix: mac & linux
        return imageFolder + '/osx/trayTemplate.png';
    } else {
        // windows
        return imageFolder + '/win/tray.ico';
    }
}

function getTrayMenu() {
    return Menu.buildFromTemplate([
        {
            label: 'Preferences', click() {
                preferences.showPreferences();
            }
        },
        {
            label: 'Logout', click() {
                preferences.logout();
            }
        },
        {
            label: 'About', click() {

            }
        },

        { type: 'separator' },

        { label: 'Quit ClipShare', role: 'quit' }
    ])
}

