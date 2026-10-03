// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Family Hub',
  tagline: 'A Home Assistant-native family command center',
  favicon: 'img/favicon.ico',

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
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Family Hub',
        logo: {
          alt: 'Family Hub Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'docsSidebar',
            position: 'left',
            label: 'Docs',
          },
          {to: '/docs/changelog', label: 'Changelog', position: 'left'},
          {
            href: 'https://community.home-assistant.io/t/ha-family-hub-a-ha-focused-alternative-to-skylight-nori-cozyla-etc/1025747',
            label: 'Community Thread',
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
              {label: 'Card Configuration', to: '/docs/card-configuration'},
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
