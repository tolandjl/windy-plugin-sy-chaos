import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-sy-chaos',   // MUST start with "windy-plugin-"
    version: '0.1.0',
    title: 'SY-Chaos Tracker',
    icon: '⛵',
    description: 'Live position of SY-Chaos from PredictWind tracking',
    author: 'Your Name',
    repository: 'https://github.com/YOUR_USERNAME/windy-plugin-sy-chaos', // optional
    desktopUI: 'rhpane',
    mobileUI: 'small',
    desktopWidth: 220,
    routerPath: '/sy-chaos',
    private: true,                  // keep private for personal use
};

export default config;