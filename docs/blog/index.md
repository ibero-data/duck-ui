---
slug: welcome-duck-ui-blog
title: "... Duck-UI?"
authors: [caioricciuti]
tags: [duck-ui]
date: 2025-02-01
---

import { useColorMode } from '@docusaurus/theme-common';
import { useEffect } from 'react';
import SQLEditorImage from '@site/static/img/sql-editor.png';
import FileImportImage from '@site/static/img/file-import.png';
import DataExplorerImage from '@site/static/img/data-explorer.png';
import QueryHistoryImage from '@site/static/img/query-history.png';

## What is Duck-UI?

Duck-UI is designed to provide a seamless and efficient user experience directly in the browser. Leveraging DuckDB's WebAssembly (WASM) capabilities, Duck-UI offers a range of features that make data interaction intuitive and powerful.

<!--truncate-->

## Key Features

### SQL Editor

Duck-UI includes a robust SQL editor with syntax highlighting and auto-completion. You can write and execute SQL queries directly in your browser, making it easy to interact with your data.

<img src={SQLEditorImage} alt="SQL Editor" />

### Data Import/Export

Import data from CSV, JSON, Parquet, and Arrow files with ease. Duck-UI also supports exporting your data, making it simple to move data in and out of the system.

<img src={FileImportImage} alt="File Import" />

### Data Explorer

Browse and manage your databases and tables with the Data Explorer. This feature allows you to preview table data, view schemas, and delete tables if needed.

<img src={DataExplorerImage} alt="Data Explorer" />

### Query History

Access your recent queries from the Query History section. You can copy queries to the clipboard or re-execute them, ensuring you never lose track of your work.

<img src={QueryHistoryImage} alt="Query History" />

### Some Shortcuts

Enhance your productivity with keyboard shortcuts for common actions. Here are a few examples:

- `Cmd/Ctrl + B`: Expand/Shrink Sidebar
- `Cmd/Ctrl + K`: Open Search Bar
- `Cmd/Ctrl + Enter`: Run Query
- `Cmd/Ctrl + Shift + Enter`: Run highlighted query


## Ready to give Duck-UI a try?

Use Duck-UI today and experience the power of DuckDB in your browser. [See it on action with our demo](https://demo.duckui.com?utm_source=github&utm_medium=readme)

or simply run it locally with Docker:

```bash
docker run -p 5522:5522 ghcr.io/caioricciuti/duck-ui:latest
```

Open your browser and navigate to `http://localhost:5522`.


## Conclusion

Duck-UI is the tool for interacting with DuckDB directly in your browser. With features like a SQL editor, data import/export, data explorer, query history, theme toggle, and keyboard shortcuts, Duck-UI makes data interaction seamless and efficient.

We hope you enjoy using Duck-UI as much as we enjoyed building it. Stay tuned for more updates and features!

[Demo](https://demo.duckui.com?utm_source=github&utm_medium=readme).

Happy querying!
