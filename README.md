# <img src="./public/logo.png" alt="Duck-UI Logo" title="Duck-UI Logo" width="50"> Duck-UI

Duck-UI is a web-based interface for interacting with DuckDB, a high-performance analytical database system. This project leverages DuckDB's WebAssembly (WASM) capabilities to provide a seamless and efficient user experience directly in the browser.

# [Official Docs](https://duckui.com?utm_source=github&utm_medium=readme) 🚀
#  [Demo](https://demo.duckui.com?utm_source=github&utm_medium=readme) 💻


## Features

- **SQL Editor**: Write and execute SQL queries with syntax highlighting and auto-completion.
- **Data Import**: Import data from CSV, JSON, Parquet, and Arrow files.
- **Data Explorer**: Browse and manage databases and tables.
- **Query History**: View and manage your recent SQL queries.

## Getting Started


### Docker (Recommended)

```bash
docker run -p 5522:5522 ghcr.io/ibero-data/duck-ui:latest
```

Open your browser and navigate to `http://localhost:5522`.

### Environment Variables

You can customize Duck-UI behavior using environment variables:

```bash
# For external DuckDB connections
docker run -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server" \
  -e DUCK_UI_EXTERNAL_PORT="8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  -e DUCK_UI_EXTERNAL_DATABASE_NAME="my_database" \
  -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" \
  ghcr.io/ibero-data/duck-ui:latest
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Name for the external connection | "" |
| `DUCK_UI_EXTERNAL_HOST` | Host URL for external DuckDB | "" |
| `DUCK_UI_EXTERNAL_PORT` | Port for external DuckDB | null |
| `DUCK_UI_EXTERNAL_USER` | Username for external connection | "" |
| `DUCK_UI_EXTERNAL_PASS` | Password for external connection | "" |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name for external connection | "" |
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow unsigned extensions in DuckDB | false |



### Prerequisites

- Node.js >= 20.x
- npm >= 10.x

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/ibero-data/duck-ui.git
   cd duck-ui
   ```

2. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

### Running the Application

1. Start the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. Open your browser and navigate to `http://localhost:5173`.

### Building for Production

To create a production build, run:

```bash
npm run build
# or
yarn build
```

The output will be in the `dist` directory.

### Running with Docker

1. Build the Docker image:

   ```bash
   docker build -t duck-ui .
   ```

2. Run the Docker container:

   ```bash
   docker run -p 5522:5522 duck-ui
   ```

3. Open your browser and navigate to `http://localhost:5522`.

## Usage

### SQL Editor

- Write your SQL queries in the editor.
- Use `Cmd/Ctrl + Enter` to execute the query.
- View the results in the results pane.

### Data Import

- Click on the "Import Files" button to upload CSV, JSON, Parquet, or Arrow files.
- Configure the table name and import settings.
- For CSV files, you can customize import options:
  - Header row detection
  - Auto-detection of column types
  - Delimiter specification
  - Error handling (ignore errors, null padding for missing columns)
- View the imported data in the Data Explorer.

### Data Explorer

- Browse through the databases and tables.
- Preview table data and view table schemas.
- Delete tables if needed.

### Query History

- Access your recent queries from the Query History section.
- Copy queries to the clipboard or re-execute them.

### Theme Toggle

- Switch between light and dark themes using the theme toggle button.

### Keyboard Shortcuts

- `Cmd/Ctrl + B`: Expand/Shrink Sidebar
- `Cmd/Ctrl + K`: Open Search Bar
- `Cmd/Ctrl + Enter`: Run Query
- `Cmd/Ctrl + Shift + Enter`: Run highlighted query

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add some feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE.md) file for details.

## Acknowledgements

- [DuckDB](https://duckdb.org/)
- [React](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://github.com/pmndrs/zustand)
- [Lucide Icons](https://lucide.dev/)

## Contact

For any inquiries or support, please contact [Caio Ricciuti](https://github.com/caioricciuti).

## Sponsors

This project is sponsored by:

### [Ibero Data](https://iberodata.es/) 
<img src="https://www.iberodata.es/logo.png" alt="Ibero Data Logo" title="Ibero Data Logo" width="100">

### [qxip](https://qxip.net/?utm_source=duck-ui&utm_medium=sponsorship) 

<img src="https://qxip.net/images/qxip.png" alt="qxip" title="qxip Logo" width="150">



<br/>

Want to be a sponsor? [Contact us](mailto:caio.ricciuti+sponsorship@outlook.com).