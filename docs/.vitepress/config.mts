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
        src: 'https://yaat.io/s.js'
      }
    ]
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Donate', link: 'https://buymeacoffee.com/caioricciuti' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/getting-started' },
          { text: 'Charts', link: '/charts' },
          { text: 'Environment Variables', link: '/environment-variables' },
          { text: 'Troubleshooting', link: '/troubleshooting' }
        ]
      },
      {
        text: 'About',
        items: [
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
      message: 'Released under the Apache 2.0 License.',
      copyright: 'Copyright © 2025 Caio Ricciuti and Ibero Data'
    },

    search: {
      provider: 'local'
    }
  }
})