// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Family Hub',
  tagline: 'A Home Assistant-native family command center',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  markdown: {
    format: 'detect',
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  url: 'https://jvarhol.github.io',
  baseUrl: '/HA-Family-Hub/',

  organizationName: 'JVarhol',
  projectName: 'HA-Family-Hub',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        indexDocs: true,
        indexBlog: false,
        indexPages: false,
        docsRouteBasePath: '/docs',
        language: ['en'],
      }),
    ],
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: 'docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/JVarhol/HA-Family-Hub/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/family-hub-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Family Hub',
        logo: {
          alt: 'Family Hub Logo',
          src: 'img/logo.png',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Docs',
          },
          {
            type: 'dropdown',
            label: 'Cards',
            position: 'left',
            to: '/docs/card-configuration',
            items: [
              {to: '/docs/card-configuration', label: 'All cards'},
              {to: '/docs/cards/family-week-calendar', label: 'Family Week Calendar'},
              {to: '/docs/cards/family-today', label: 'Family Today'},
              {to: '/docs/cards/right-now', label: 'Right Now'},
              {to: '/docs/cards/chores', label: 'Chores'},
              {to: '/docs/cards/rewards', label: 'Rewards'},
              {to: '/docs/cards/goals', label: 'Goals'},
              {to: '/docs/cards/todo-lists', label: 'To-Do Lists'},
              {to: '/docs/cards/recipe-box', label: 'Recipe Box'},
              {to: '/docs/cards/my-pantry', label: 'My Pantry'},
              {to: '/docs/cards/active-timers', label: 'Active Timers'},
              {to: '/docs/cards/screen-saver', label: 'Screen Saver'},
              {to: '/docs/cards/theme-selector', label: 'Theme Selector'},
            ],
          },
          {to: '/docs/changelog', label: 'Changelog', position: 'left'},
          {
            href: 'https://community.home-assistant.io/t/ha-family-hub-a-ha-focused-alternative-to-skylight-nori-cozyla-etc/1025747',
            label: 'Community Thread',
            position: 'right',
          },
          {
            href: 'https://discord.com/channels/330944238910963714/1543630448800960653',
            label: 'Discord',
            position: 'right',
          },
          {
            href: 'https://github.com/JVarhol/HA-Family-Hub',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {label: 'Introduction', to: '/docs/intro'},
              {label: 'Installation', to: '/docs/installation'},
              {label: 'Cards', to: '/docs/card-configuration'},
              {label: 'Settings', to: '/docs/settings-modal'},
              {label: 'Changelog', to: '/docs/changelog'},
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Home Assistant Community Thread',
                href: 'https://community.home-assistant.io/t/ha-family-hub-a-ha-focused-alternative-to-skylight-nori-cozyla-etc/1025747',
              },
              {
                label: 'Discord discussion',
                href: 'https://discord.com/channels/330944238910963714/1543630448800960653',
              },
              {
                label: 'Issues',
                href: 'https://github.com/JVarhol/HA-Family-Hub/issues',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'GitHub',
                href: 'https://github.com/JVarhol/HA-Family-Hub',
              },
              {
                label: 'Releases',
                href: 'https://github.com/JVarhol/HA-Family-Hub/releases',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Bordello Labs. Licensed under GPL-3.0. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
