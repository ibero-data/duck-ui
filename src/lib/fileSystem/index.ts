/**
 * File System Access API Service
 * Provides persistent folder access across browser sessions
 */

// Types for file system entries
export interface FileEntry {
  name: string;
  path: string;
  type: "file";
  size: number;
  lastModified: Date;
  extension: string;
  handle: FileSystemFileHandle;
}

export interface FolderEntry {
  name: string;
  path: string;
  type: "folder";
  children?: (FileEntry | FolderEntry)[];
  handle: FileSystemDirectoryHandle;
}

export type FSEntry = FileEntry | FolderEntry;

export interface MountedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  addedAt: Date;
  hasPermission: boolean;
}

// Supported file extensions for DuckDB
export const SUPPORTED_EXTENSIONS = [
  ".csv",
  ".tsv",
  ".json",
  ".jsonl",
  ".ndjson",
  ".parquet",
  ".arrow",
  ".ipc",
  ".duckdb",
  ".db",
  ".ddb",
  ".xlsx",
  ".xls",
];

// Check if File System Access API is supported
export function isFileSystemAccessSupported(): boolean {
  return "showDirectoryPicker" in window;
}

// IndexedDB database name and store
const DB_NAME = "duck-ui-filesystem";
const STORE_NAME = "folder-handles";
const DB_VERSION = 1;

/**
 * Open IndexedDB for storing folder handles
 */
async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Verify read permission for a directory handle
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "read"
): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = { mode };

  // Check if we already have permission
  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }

  // Request permission
  if ((await handle.requestPermission(options)) === "granted") {
    return true;
  }

  return false;
}

/**
 * Get file extension
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot).toLowerCase() : "";
}

/**
 * File System Service - Singleton
 */
class FileSystemService {
  private db: IDBDatabase | null = null;
  private folders: Map<string, MountedFolder> = new Map();
  private initialized = false;

  /**
   * Initialize the service and load persisted folder handles
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!isFileSystemAccessSupported()) {
      console.warn("File System Access API not supported");
      this.initialized = true;
      return;
    }

    try {
      this.db = await openDatabase();
      await this.loadPersistedFolders();
      this.initialized = true;
    } catch (error) {
      console.error("Failed to initialize FileSystemService:", error);
      throw error;
    }
  }

  /**
   * Load folder handles from IndexedDB
   */
  private async loadPersistedFolders(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const folders = request.result as MountedFolder[];
        for (const folder of folders) {
          // Restore date objects
          folder.addedAt = new Date(folder.addedAt);
          folder.hasPermission = false; // Will verify on demand
          this.folders.set(folder.id, folder);
        }
        resolve();
      };
    });
  }

  /**
   * Save folder handle to IndexedDB
   */
  private async persistFolder(folder: MountedFolder): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(folder);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Remove folder handle from IndexedDB
   */
  private async removePersistedFolder(id: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Show folder picker and mount the selected folder
   */
  async mountFolder(): Promise<MountedFolder> {
    if (!isFileSystemAccessSupported()) {
      throw new Error("File System Access API not supported in this browser");
    }

    // Show the directory picker
    const handle = await window.showDirectoryPicker({
      mode: "read",
    });

    // Generate unique ID
    const id = crypto.randomUUID();

    const folder: MountedFolder = {
      id,
      name: handle.name,
      handle,
      addedAt: new Date(),
      hasPermission: true,
    };

    // Store in memory and IndexedDB
    this.folders.set(id, folder);
    await this.persistFolder(folder);

    return folder;
  }

  /**
   * Unmount a folder
   */
  async unmountFolder(id: string): Promise<void> {
    this.folders.delete(id);
    await this.removePersistedFolder(id);
  }

  /**
   * Get all mounted folders
   */
  getMountedFolders(): MountedFolder[] {
    return Array.from(this.folders.values());
  }

  /**
   * Get a specific folder by ID
   */
  getFolder(id: string): MountedFolder | undefined {
    return this.folders.get(id);
  }

  /**
   * Verify and request permission for a folder
   */
  async requestPermission(id: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder) return false;

    const hasPermission = await verifyPermission(folder.handle);
    folder.hasPermission = hasPermission;
    return hasPermission;
  }

  /**
   * Check permission status for all folders
   */
  async checkAllPermissions(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, folder] of this.folders) {
      try {
        // Just query, don't request
        const status = await folder.handle.queryPermission({ mode: "read" });
        folder.hasPermission = status === "granted";
        results.set(id, folder.hasPermission);
      } catch {
        folder.hasPermission = false;
        results.set(id, false);
      }
    }

    return results;
  }

  /**
   * List files in a folder (with optional filtering)
   */
  async listFiles(
    id: string,
    options: {
      recursive?: boolean;
      filterSupported?: boolean;
    } = {}
  ): Promise<FSEntry[]> {
    const { recursive = false, filterSupported = true } = options;
    const folder = this.folders.get(id);

    if (!folder) {
      throw new Error(`Folder not found: ${id}`);
    }

    if (!folder.hasPermission) {
      const granted = await this.requestPermission(id);
      if (!granted) {
        throw new Error("Permission denied");
      }
    }

    return this.readDirectory(folder.handle, "", recursive, filterSupported);
  }

  /**
   * Read directory contents recursively
   */
  private async readDirectory(
    handle: FileSystemDirectoryHandle,
    basePath: string,
    recursive: boolean,
    filterSupported: boolean
  ): Promise<FSEntry[]> {
    const entries: FSEntry[] = [];

    for await (const entry of handle.values()) {
      const path = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.kind === "file") {
        const fileHandle = entry as FileSystemFileHandle;
        const ext = getExtension(entry.name);

        // Skip unsupported files if filtering
        if (filterSupported && !SUPPORTED_EXTENSIONS.includes(ext)) {
          continue;
        }

        try {
          const file = await fileHandle.getFile();
          entries.push({
            name: entry.name,
            path,
            type: "file",
            size: file.size,
            lastModified: new Date(file.lastModified),
            extension: ext,
            handle: fileHandle,
          });
        } catch {
          // Skip files we can't read
        }
      } else if (entry.kind === "directory") {
        const dirHandle = entry as FileSystemDirectoryHandle;
        const folderEntry: FolderEntry = {
          name: entry.name,
          path,
          type: "folder",
          handle: dirHandle,
        };

        if (recursive) {
          folderEntry.children = await this.readDirectory(
            dirHandle,
            path,
            recursive,
            filterSupported
          );
        }

        entries.push(folderEntry);
      }
    }

    // Sort: folders first, then files, alphabetically
    return entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Read a specific file from a mounted folder
   */
  async readFile(folderId: string, filePath: string): Promise<File> {
    const folder = this.folders.get(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    if (!folder.hasPermission) {
      const granted = await this.requestPermission(folderId);
      if (!granted) {
        throw new Error("Permission denied");
      }
    }

    // Navigate to the file
    const parts = filePath.split("/");
    let currentHandle: FileSystemDirectoryHandle = folder.handle;

    // Navigate through directories
    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }

    // Get the file
    const fileName = parts[parts.length - 1];
    const fileHandle = await currentHandle.getFileHandle(fileName);
    return fileHandle.getFile();
  }

  /**
   * Get file as ArrayBuffer
   */
  async readFileBuffer(folderId: string, filePath: string): Promise<ArrayBuffer> {
    const file = await this.readFile(folderId, filePath);
    return file.arrayBuffer();
  }

  /**
   * Request write permission for a folder
   */
  async requestWritePermission(id: string): Promise<boolean> {
    const folder = this.folders.get(id);
    if (!folder) return false;

    const hasPermission = await verifyPermission(folder.handle, "readwrite");
    folder.hasPermission = hasPermission;
    return hasPermission;
  }

  /**
   * Save a file to a mounted folder
   */
  async saveFile(
    folderId: string,
    fileName: string,
    content: Blob | ArrayBuffer | string,
    subPath?: string
  ): Promise<void> {
    const folder = this.folders.get(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    // Request write permission
    const hasPermission = await this.requestWritePermission(folderId);
    if (!hasPermission) {
      throw new Error("Write permission denied");
    }

    // Navigate to subfolder if specified
    let targetHandle: FileSystemDirectoryHandle = folder.handle;
    if (subPath) {
      const parts = subPath.split("/").filter(Boolean);
      for (const part of parts) {
        targetHandle = await targetHandle.getDirectoryHandle(part, { create: true });
      }
    }

    // Create or overwrite the file
    const fileHandle = await targetHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    try {
      if (typeof content === "string") {
        await writable.write(content);
      } else if (content instanceof Blob) {
        await writable.write(content);
      } else {
        // ArrayBuffer
        await writable.write(new Blob([content]));
      }
    } finally {
      await writable.close();
    }
  }

  /**
   * Get folder handle for a mounted folder (for direct access)
   */
  getFolderHandle(id: string): FileSystemDirectoryHandle | undefined {
    return this.folders.get(id)?.handle;
  }
}

// Export singleton instance
export const fileSystemService = new FileSystemService();
