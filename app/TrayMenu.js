"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const platform = require('os').platform();
const imageFolder = './assets/icons';
class TrayMenu extends electron_1.Tray {
    constructor() {
        super(getTrayIcon());
    }
    createTrayMenu() {
        if (platform == 'darwin') {
            const iconPath = imageFolder + '/osx/trayHighlight.png';
            console.log('iconPath:', iconPath);
            this.setPressedImage(electron_1.nativeImage.createFromPath(iconPath));
        }
        this.setToolTip('ClipChare');
        this.setContextMenu(getTrayMenu());
    }
}
exports.TrayMenu = TrayMenu;
function getTrayIcon() {
    return electron_1.nativeImage.createFromPath(getTrayIconPath());
}
function getTrayIconPath() {
    if (platform == 'darwin') {
        // *nix: mac & linux
        return imageFolder + '/osx/trayTemplate.png';
    }
    else {
        // windows
        return imageFolder + '/win/tray.ico';
    }
}
function getTrayMenu() {
    return electron_1.Menu.buildFromTemplate([
        {
            label: 'Preferences', click() {
            }
        },
        {
            label: 'About', click() {
            }
        },
        { type: 'separator' },
        { label: 'Quit ClipShare', role: 'quit' }
    ]);
}
//# sourceMappingURL=TrayMenu.js.map