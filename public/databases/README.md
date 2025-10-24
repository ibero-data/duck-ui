# Embedded Databases

This directory allows you to embed DuckDB database files (`.db`) that will be automatically loaded when DuckUI starts. This is perfect for:

- Deploying DuckUI with demo data
- Distributing pre-configured databases
- Creating self-contained analytical dashboards

## How to Add Your Database

1. **Place your `.db` file in this directory**
   ```
   public/databases/my-database.db
   ```

2. **Register it in `manifest.json`**
   ```json
   {
     "databases": [
       {
         "name": "My Database",
         "file": "my-database.db",
         "description": "Description of your database",
         "autoLoad": true
       }
     ]
   }
   ```

3. **Build and deploy**
   ```bash
   bun run build
   ```

## Manifest Format

Each database entry in `manifest.json` supports:

- **`name`** (required): Display name in the UI
- **`file`** (required): Filename of the `.db` file in this directory
- **`description`** (optional): Description shown in the UI
- **`autoLoad`** (optional, default: `true`): Whether to load on startup

## Example

```json
{
  "databases": [
    {
      "name": "Sales Demo",
      "file": "sales-demo.db",
      "description": "Sample sales data from 2023",
      "autoLoad": true
    },
    {
      "name": "Analytics",
      "file": "analytics.db",
      "description": "Web analytics data",
      "autoLoad": false
    }
  ]
}
```

## Notes

- Database files are fetched and loaded in the browser
- Large database files will increase initial load time
- All databases are loaded into memory (consider file sizes)
- You can attach/detach databases dynamically from the SQL editor
