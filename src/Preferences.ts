const ElectronPreferences = require('electron-preferences')
const path = require('path')
const { app } = require('electron')

function showPreferences() {
    preferences.show();
}

function getToken() {
    return preferences.value('account.token');
}

function saveToken(value: string) {
    preferences.value('account.token', value);
}

function logout() {
    preferences.value('account.token', null);
}

function getScreenshotsDirectory() {
    return preferences.value('general.screenshots');
}

function saveScreenshotsDirectory(path: string) {
    preferences.value('general.screenshots', path);
}

const preferences = new ElectronPreferences({
    /**
     * Where should preferences be saved?
     */
    'dataStore': path.resolve(app.getPath('userData'), 'preferences.json'),
    /**
     * Default values.
     */
    'defaults': {
        'markdown': {
            'auto_format_links': true,
            'show_gutter': false
        },
        'preview': {
            'show': true
        },
        'drawer': {
            'show': true
        }
    },
    /**
     * If the `onLoad` method is specified, this function will be called immediately after
     * preferences are loaded for the first time. The return value of this method will be stored as the
     * preferences object.
     */
    'onLoad': (preferences: any) => {
        return preferences;
    },
    /**
     * The preferences window is divided into sections. Each section has a label, an icon, and one or
     * more fields associated with it. Each section should also be given a unique ID.
     */
    'sections': [
        {
            'id': 'general',
            'label': 'General',
            'form': {
                'groups': [{
                    'fields': [
                        {
                            'key': 'general-options',
                            'type': 'checkbox',
                            'options': [
                                { 'label': 'Minimize to Tray', 'value': 'minimize_to_tray' },
                                { 'label': 'Automatically launch on startup', 'value': 'launch_on_startup' }
                            ],
                        },
                        {
                            'label': 'Screenshots Folder',
                            'key': 'screenshots',
                            'type': 'directory',
                            'help': 'The folder which will be monitored for new screenshots'
                        }
                    ]
                }]
            }
        },
        {
            'id': 'account',
            'label': 'Account',
            /**
             * See the list of available icons below.
             */
            'icon': 'single-01',
            'form': {
                'groups': [
                    {
                        /**
                         * Group heading is optional.
                         */
                        'label': 'Google Drive Account',
                        'fields': [
                            {

                            }
                        ]
                    }
                ]
            }
        }
    ]
});

module.exports.showPreferences = showPreferences;
module.exports.logout = logout;
module.exports.getToken = getToken;
module.exports.saveToken = saveToken;
module.exports.getScreenshotsDirectory = getScreenshotsDirectory;
module.exports.saveScreenshotsDirectory = saveScreenshotsDirectory;
module.exports.preferences = preferences;
