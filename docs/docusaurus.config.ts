import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Duck-UI: Data Visualization Made Easy",
  tagline:
    "Unlock insights with Duck-UI, a powerful data visualization tool. Create interactive dashboards and explore data effortlessly.",
  favicon: "img/logo-padding.png",
  url: "https://duckui.com",
  baseUrl: "/",

  organizationName: "caioricciuti",
  projectName: "duck-ui",
  deploymentBranch: "gh-pages",

  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl:
            "https://github.com/caioricciuti/duck-ui/tree/main/packages/create-docusaurus/templates/shared/",
          showLastUpdateAuthor: true,
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
            copyright: `Copyright © ${new Date().getFullYear()} Duck-UI`,
          },
          editUrl:
            "https://github.com/caioricciuti/duck-ui/tree/main/packages/create-docusaurus/templates/shared/",
          blogTitle: "Duck-UI Blog - Latest Updates and Tutorials",
          blogDescription:
            "Keep up with the latest news, tutorials, and updates about Duck-UI data visualization tools.",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          ignorePatterns: ["/tags/**", "/page/*"],
          filename: "sitemap.xml",
        },
      } satisfies Preset.Options,
    ],
  ],

  headTags: [
    {
      tagName: "meta",
      attributes: {
        name: "description",
        content:
          "Duck-UI: Create powerful data visualizations and interactive dashboards. Open-source tool for data analysis, charts, and business intelligence. Start visualizing your data today.",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "keywords",
        content:
          "data visualization, dashboard builder, business intelligence, charts, analytics, open source, React components",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "author",
        content: "Caio Ricciuti",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "robots",
        content: "index, follow",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:title",
        content: "Duck-UI: Data Visualization Made Easy",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:description",
        content:
          "Create powerful data visualizations and interactive dashboards with Duck-UI. Open-source tool for data analysis and business intelligence.",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:image",
        content: "https://duckui.com/img/social-card.png",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:image:width",
        content: "1200",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:image:height",
        content: "630",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:url",
        content: "https://duckui.com",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:type",
        content: "website",
      },
    },
    {
      tagName: "meta",
      attributes: {
        property: "og:site_name",
        content: "Duck-UI Documentation",
      },
    },

    // Twitter Card
    {
      tagName: "meta",
      attributes: {
        name: "twitter:card",
        content: "summary_large_image",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "twitter:site",
        content: "@caioricciuti",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "twitter:creator",
        content: "@caioricciuti",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "twitter:title",
        content: "Duck-UI: Data Visualization Made Easy",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "twitter:description",
        content:
          "Create powerful data visualizations and interactive dashboards with Duck-UI. Open-source tool for data analysis and business intelligence.",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "twitter:image",
        content: "https://duckui.com/img/social-card.png",
      },
    },

    // Additional SEO
    {
      tagName: "meta",
      attributes: {
        name: "application-name",
        content: "Duck-UI",
      },
    },
    {
      tagName: "meta",
      attributes: {
        name: "apple-mobile-web-app-title",
        content: "Duck-UI",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "canonical",
        href: "https://duckui.com",
      },
    },
  ],

  scripts: [
    {
      src: "https://umami.duckui.com/script.js",
      async: true,
      defer: true,
      "data-website-id": "9b538d8e-9ac4-4c80-a88f-4987208f0b85",
    },
  ],

  themeConfig: {
    // Force dark theme only
    colorMode: {
      defaultMode: "dark",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    // Search
    algolia: {
      appId: "XNIVYIPFRS",
      apiKey: "5daeb5999d13cfe80b4f1cc20fe01a02",
      indexName: "DuckUI Crawler",
      contextualSearch: true,
    },
    // Default image for social media sharing
    image: "img/social-card.png",
    // Navbar configuration
    navbar: {
      title: "Duck-UI",
      logo: {
        alt: "Duck-UI Logo",
        src: "img/logo-padding.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "right",
          label: "Docs",
        },
        {
          to: "/blog",
          label: "Blog",
          position: "right",
        },
        {
          href: "https://buymeacoffee.com/caioricciuti",
          position: "right",
          label: "Donate",
        },
        {
          href: "https://github.com/caioricciuti/duck-ui",
          position: "right",
          className: "header-github-link",
          "aria-label": "GitHub repository",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started",
            },
            {
              label: "Legal",
              to: "/docs/legal",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/caioricciuti/duck-ui",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "Blog",
              to: "/blog",
            },
            {
              label: "Donate",
              href: "https://buymeacoffee.com/caioricciuti",
            },
          ],
        },
      ],
      copyright: `${new Date().getFullYear()} Duck-ui. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.dracula,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
