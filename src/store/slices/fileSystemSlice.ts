import type { StateCreator } from "zustand";
import { toast } from "sonner";
import type { DuckStoreState, FileSystemSlice, MountedFolderInfo } from "../types";

export const createFileSystemSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  FileSystemSlice
> = (set) => ({
  mountedFolders: [],
  isFileSystemSupported: typeof window !== "undefined" && "showDirectoryPicker" in window,

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
});
