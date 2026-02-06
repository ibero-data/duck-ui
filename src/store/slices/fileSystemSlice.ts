import type { StateCreator } from "zustand";
import { toast } from "sonner";
import { cloudStorageService } from "@/lib/cloudStorage";
import type { DuckStoreState, FileSystemSlice, MountedFolderInfo } from "../types";

export const createFileSystemSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  FileSystemSlice
> = (set) => ({
  mountedFolders: [],
  isFileSystemSupported: typeof window !== "undefined" && "showDirectoryPicker" in window,
  cloudConnections: [],
  cloudSupportStatus: null,
  isCloudStorageInitialized: false,

  // File System Access Actions
  initFileSystem: async () => {
    const { fileSystemService, isFileSystemAccessSupported } = await import("@/lib/fileSystem");

    if (!isFileSystemAccessSupported()) {
      set({ isFileSystemSupported: false });
      return;
    }

    try {
      await fileSystemService.init();

      const folders = fileSystemService.getMountedFolders();
      const folderInfos: MountedFolderInfo[] = folders.map((f) => ({
        id: f.id,
        name: f.name,
        addedAt: f.addedAt,
        hasPermission: f.hasPermission,
      }));

      set({ mountedFolders: folderInfos, isFileSystemSupported: true });
    } catch (error) {
      console.error("Failed to initialize file system:", error);
      toast.error("Failed to initialize file system access");
    }
  },

  mountFolder: async () => {
    const { fileSystemService, isFileSystemAccessSupported } = await import("@/lib/fileSystem");

    if (!isFileSystemAccessSupported()) {
      toast.error("File System Access API is not supported in this browser");
      return null;
    }

    try {
      await fileSystemService.init();
      const folder = await fileSystemService.mountFolder();

      const folderInfo: MountedFolderInfo = {
        id: folder.id,
        name: folder.name,
        addedAt: folder.addedAt,
        hasPermission: folder.hasPermission,
      };

      set((state) => ({
        mountedFolders: [...state.mountedFolders, folderInfo],
      }));

      toast.success(`Folder "${folder.name}" mounted successfully`);
      return folderInfo;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      console.error("Failed to mount folder:", error);
      toast.error("Failed to mount folder");
      return null;
    }
  },

  unmountFolder: async (id) => {
    const { fileSystemService } = await import("@/lib/fileSystem");

    try {
      await fileSystemService.unmountFolder(id);

      set((state) => ({
        mountedFolders: state.mountedFolders.filter((f) => f.id !== id),
      }));

      toast.success("Folder unmounted");
    } catch (error) {
      console.error("Failed to unmount folder:", error);
      toast.error("Failed to unmount folder");
    }
  },

  refreshFolderPermissions: async () => {
    const { fileSystemService } = await import("@/lib/fileSystem");

    try {
      await fileSystemService.init();
      const permissions = await fileSystemService.checkAllPermissions();

      set((state) => ({
        mountedFolders: state.mountedFolders.map((f) => ({
          ...f,
          hasPermission: permissions.get(f.id) ?? false,
        })),
      }));
    } catch (error) {
      console.error("Failed to refresh permissions:", error);
    }
  },

  // Cloud Storage Actions
  initCloudStorage: async () => {
    try {
      await cloudStorageService.init();
      const connections = cloudStorageService.getConnections();
      const supportStatus = cloudStorageService.getSupportStatus();

      set({
        cloudConnections: connections,
        cloudSupportStatus: supportStatus,
        isCloudStorageInitialized: true,
      });

      if (supportStatus && !supportStatus.httpfsAvailable) {
        console.warn("Cloud storage: httpfs not available in this browser");
      }
    } catch (error) {
      console.error("Failed to initialize cloud storage:", error);
    }
  },

  addCloudConnection: async (config) => {
    try {
      const conn = await cloudStorageService.addConnection(config);

      set((state) => ({
        cloudConnections: [...state.cloudConnections, conn],
      }));

      toast.success(`Cloud connection "${conn.name}" added`);
      return conn;
    } catch (error) {
      console.error("Failed to add cloud connection:", error);
      toast.error("Failed to add cloud connection");
      return null;
    }
  },

  removeCloudConnection: async (id) => {
    try {
      const conn = cloudStorageService.getConnection(id);
      await cloudStorageService.removeConnection(id);

      set((state) => ({
        cloudConnections: state.cloudConnections.filter((c) => c.id !== id),
      }));

      toast.success(`Cloud connection "${conn?.name || id}" removed`);
    } catch (error) {
      console.error("Failed to remove cloud connection:", error);
      toast.error("Failed to remove cloud connection");
    }
  },

  connectCloudStorage: async (id) => {
    try {
      const success = await cloudStorageService.connect(id);

      if (success) {
        set((state) => ({
          cloudConnections: state.cloudConnections.map((c) =>
            c.id === id ? { ...c, isConnected: true, lastError: undefined } : c
          ),
        }));
        toast.success("Connected to cloud storage");
      }

      return success;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      set((state) => ({
        cloudConnections: state.cloudConnections.map((c) =>
          c.id === id ? { ...c, isConnected: false, lastError: errorMsg } : c
        ),
      }));

      toast.error(`Failed to connect: ${errorMsg}`);
      return false;
    }
  },

  disconnectCloudStorage: async (id) => {
    try {
      await cloudStorageService.disconnect(id);

      set((state) => ({
        cloudConnections: state.cloudConnections.map((c) =>
          c.id === id ? { ...c, isConnected: false } : c
        ),
      }));

      toast.success("Disconnected from cloud storage");
    } catch (error) {
      console.error("Failed to disconnect cloud storage:", error);
    }
  },

  testCloudConnection: async (id) => {
    return cloudStorageService.testConnection(id);
  },
});
