import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Duck-UI",
  tagline:
    "Data is better when we see it! Duck-UI is a data visualization tool that allows you to slice and dice your data with ease.",
  favicon: "img/logo-padding.png",
  // Set the production url of your site here
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
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ["rss", "atom"],
            xslt: true,
          },
          editUrl:
            "https://github.com/caioricciuti/duck-ui/tree/main/packages/create-docusaurus/templates/shared/",
          onInlineTags: "warn",
          onInlineAuthors: "warn",
          onUntruncatedBlogPosts: "warn",
        },
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  headTags: [
    {
      tagName: "meta",
      attributes: {
        property: "og:image",
        content: "img/social-card.png", // Use the relative path to your image.
      },
    },
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
        name: "twitter:image",
        content: "img/social-card.png",
      },
    },

    // Add Umami tracking code
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
    algolia: {
      appId: "XNIVYIPFRS",
      apiKey: "5daeb5999d13cfe80b4f1cc20fe01a02",
      indexName: "DuckUI Crawler",
      contextualSearch: true,
    },
    image: "img/social-card.png",
    navbar: {
      title: "Duck-UI",
      logo: {
        alt: "Duck-ui Logo",
        src: "img/logo-padding.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "tutorialSidebar",
          position: "right",
          label: "Docs",
        },
        { to: "/blog", label: "Blog", position: "right" },
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
    prism: {
      theme: prismThemes.dracula,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
