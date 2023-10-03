import { defineConfig } from 'vitepress';

// On GitHub Pages the site lives under /<repo>/ and the playground under /<repo>/playground/.
const base = process.env.DOCS_BASE ?? '/';
const playground = `${base}playground/`;

export default defineConfig({
  title: 'Tessera',
  description: 'Build apps from pieces — the plugin core behind the Tessera feature kits.',
  base,
  cleanUrls: true,
  // The playground is a separate Vite build deployed beside the docs.
  ignoreDeadLinks: [/^\/playground\//],
  lastUpdated: false,
  head: [['meta', { name: 'theme-color', content: '#1d4ed8' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Reference', link: '/reference/configuration' },
      { text: 'Playground', link: playground, target: '_self' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Quick start', link: '/guide/quick-start' },
          { text: 'Adapters', link: '/guide/adapters' },
          { text: 'Writing a plugin', link: '/guide/writing-a-plugin' },
          { text: 'Theming', link: '/guide/theming' },
          { text: 'Internationalisation', link: '/guide/i18n' },
          { text: 'Testing', link: '/guide/testing' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Configuration', link: '/reference/configuration' },
          { text: 'Wire protocol', link: '/reference/protocol' },
          { text: 'Kit catalog', link: '/reference/kits' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/thakurabhishek7283/tessera' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/thakurabhishek7283/tessera/edit/main/apps/docs/:path',
      text: 'Edit this page',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Abhishek Thakur',
    },
  },
});
