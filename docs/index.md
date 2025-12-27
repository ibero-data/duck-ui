---
layout: home

hero:
  name: "Data is better when we see it!"
  tagline: "Duck-UI makes working with data easy. Run SQL queries directly in your browser with DuckDB WASM - no server required!"
  image:
    src: /logo.png
    alt: Duck-UI
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/ibero-data/duck-ui
    - theme: alt
      text: Live Demo
      link: https://demo.duckui.com?utm_source=duck-ui&utm_medium=docs


features:
  - title: SQL Editor
    details: Advanced Monaco editor with IntelliSense, syntax highlighting, and query history

  - title: Browser-Based Database
    details: DuckDB runs entirely in your browser using WebAssembly - no server setup required

  - title: Multiple Query Tabs
    details: Work with multiple queries simultaneously using a familiar tab interface

  - title: Data Import
    details: Import CSV, JSON, Parquet, and Arrow files directly from your computer or URLs

  - title: OPFS Storage
    details: Persistent databases using Origin Private File System for data that persists across sessions

  - title: External Connections
    details: Connect to remote DuckDB servers via HTTP API for shared database access

  - title: Data Explorer
    details: Browse databases, tables, and columns with an intuitive interface

  - title: Query Preview
    details: Preview data before importing with schema customization options

  - title: Persistent Folder Access
    details: Mount folders from your computer and access files directly. Persists across sessions with one-click import to DuckDB.

  - title: Duck Brain AI
    details: Natural language to SQL using local AI (WebLLM/WebGPU) or cloud providers (OpenAI, Claude). Your data stays private.

  - title: Fast & Private
    details: All data processing happens in your browser - your data never leaves your machine
---

## Screenshots

<ScreenshotGallery />

## Quick Installation

### Docker

```bash
docker run --name duck-ui -p 5522:5522 \
  ghcr.io/ibero-data/duck-ui:latest
```

Access at: `http://localhost:5522`

[Full Installation Guide →](/getting-started)

## What is Duck-UI?

Duck-UI is a modern web interface for **DuckDB**, the fast in-process analytical database. It leverages DuckDB's WebAssembly capabilities to run entirely in your browser, providing a powerful SQL editor and data analysis platform without requiring any server infrastructure.

### Key Features

- 🦆 **No Server Required**: DuckDB runs in your browser via WebAssembly
- 🧠 **AI-Powered**: Natural language to SQL with local or cloud AI (Duck Brain)
- 📁 **Import Anything**: Load CSV, JSON, Parquet, Arrow files from local storage or URLs
- 📂 **Folder Access**: Mount folders from your computer - persists across browser sessions
- 💾 **Persistent Storage**: Save databases using OPFS for data that persists across sessions
- 🔌 **External Connections**: Connect to remote DuckDB servers when needed
- ⚡ **Lightning Fast**: Near-native performance thanks to WebAssembly
- 🔒 **Privacy First**: All data processing happens client-side

## Requirements

- Modern web browser with WebAssembly support:
  - Chrome/Edge 88+
  - Firefox 79+
  - Safari 14+
- Docker (for containerized deployment) or Bun/Node.js 20+ (for building from source)
- **No database server needed** for local WASM mode

## Use Cases

### Data Analysis

Analyze CSV, JSON, or Parquet files directly in your browser without uploading to a server:

```sql
SELECT product, SUM(sales) as total_sales
FROM read_csv('sales_data.csv')
GROUP BY product
ORDER BY total_sales DESC;
```

### Quick Prototyping

Test SQL queries and data transformations without setting up infrastructure:

```sql
-- Load data from URL
CREATE TABLE products AS
SELECT * FROM read_parquet('https://example.com/products.parquet');

-- Run analytics
SELECT category, AVG(price) as avg_price
FROM products
GROUP BY category;
```

### Learning SQL

Perfect environment for learning SQL with instant feedback and no setup:

- Import sample datasets
- Write queries with autocomplete
- See results immediately
- No database configuration needed

## Sponsors

We would like to thank our sponsors for their support:

### [Ibero Data](https://www.iberodata.es/?utm_source=duck-ui&utm_medium=docs)

Empowering businesses with data-driven solutions

### [QXIP](https://qxip.net/?utm_source=duck-ui&utm_medium=docs)

Next-Gen Telecom Observability - qxip {quicksip} is an R&D Company pioneering Open-Source and Commercial Observability and Telecom Monitoring Technology development.

[**Become a Sponsor →**](mailto:caio.ricciuti+sponsorship@outlook.com?subject=DUCK-UI%20Sponsorship%20Inquiry)

## Support

- 📖 [Documentation](/getting-started)
- 🐛 [Report Issues](https://github.com/ibero-data/duck-ui/issues)
- 💬 [Discussions](https://github.com/ibero-data/duck-ui/discussions)
- ⭐ [Star on GitHub](https://github.com/ibero-data/duck-ui)

## License

Duck-UI is open source software [licensed under Apache 2.0](/license).

---

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=caioricciuti&button_colour=D99B43&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00)](https://buymeacoffee.com/caioricciuti)
