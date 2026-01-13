import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Duck-UI",
  description: "Modern web interface for DuckDB wasm. Run SQL queries directly in your browser.",
  base: '/',

  // Ignore localhost links in examples
  ignoreDeadLinks: [
    /^http:\/\/localhost/
  ],
  
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['link', { rel: 'shortcut icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#D99B43' }],
    // YAAT Analytics
    [
      'script',
      {
        defer: '',
        src: 'https://yaat.io/s/yaat.js',
      }
    ]
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Ecosystem', link: '/ecosystem' },
      { text: 'Donate', link: 'https://buymeacoffee.com/caioricciuti' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/getting-started' },
          { text: 'Duck Brain AI', link: '/duck-brain' },
          { text: 'Folder Access', link: '/folder-access' },
          { text: 'Charts', link: '/charts' },
          { text: 'Environment Variables', link: '/environment-variables' },
          { text: 'Troubleshooting', link: '/troubleshooting' }
        ]
      },
      {
        text: 'About',
        items: [
          { text: 'Ecosystem', link: '/ecosystem' },
          { text: 'Changelog', link: 'https://github.com/ibero-data/duck-ui/releases' },
          { text: 'Acknowledgments', link: '/acknowledgments' },
          { text: 'License', link: '/license' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ibero-data/duck-ui' }
    ],

    footer: {
      message: 'Released under the Apache 2.0 License. | <a href="https://iberodata.es" target="_blank">Ibero Data</a> · <a href="https://ch-ui.com" target="_blank">CH-UI</a> · <a href="https://yaat.io" target="_blank">YAAT</a>',
      copyright: 'Copyright © 2025 Caio Ricciuti and Ibero Data'
    },

    search: {
      provider: 'local'
    }
  }
})