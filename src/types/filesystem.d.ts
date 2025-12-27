/**
 * File System Access API type declarations
 * These APIs are available in Chrome 86+ and Edge 86+
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
}

interface FileSystemGetDirectoryOptions {
  create?: boolean;
}

interface FileSystemGetFileOptions {
  create?: boolean;
}

interface FileSystemRemoveOptions {
  recursive?: boolean;
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: FileSystemWriteChunkType): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

type FileSystemWriteChunkType =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | string
  | WriteParams;

interface WriteParams {
  type: "write" | "seek" | "truncate";
  size?: number;
  position?: number;
  data?: ArrayBuffer | ArrayBufferView | Blob | string;
}

interface OpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: FilePickerAcceptType[];
  startIn?: FileSystemHandle | WellKnownDirectory;
}

interface SaveFilePickerOptions {
  excludeAcceptAllOption?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  startIn?: FileSystemHandle | WellKnownDirectory;
}

interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | WellKnownDirectory;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string | string[]>;
}

type WellKnownDirectory =
  | "desktop"
  | "documents"
  | "downloads"
  | "music"
  | "pictures"
  | "videos";

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
