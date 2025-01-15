import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { format } from "date-fns";
import {
  Upload,
  FileWarning,
  FileCheck,
  Loader2,
  X,
  FileIcon,
  Calendar,
  HardDrive,
  UploadIcon,
} from "lucide-react";
import { useDuckStore } from "@/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Constants
const ACCEPTED_FILE_TYPES = {
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/octet-stream": [".parquet", ".arrow"],
};

const MAX_FILE_SIZE = 1000 * 1024 * 1024; // 1GB

const SUPPORTED_FILE_EXTENSIONS = ["csv", "json", "parquet", "arrow"];

// Types
interface FileWithPreview extends File {
  preview?: string;
}

interface UploadError {
  id: string;
  message: string;
  file?: string;
}

interface FileImportState {
  fileName: string;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

interface FileImporterProps {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  context: string;
}

// Utility Functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getFileIcon = (fileType: string) => {
  const iconProps = { className: "w-8 h-8" };
  switch (fileType.toLowerCase()) {
    case "csv":
      return <FileIcon {...iconProps} color="#38A169" />;
    case "json":
      return <FileIcon {...iconProps} color="#D69E2E" />;
    case "parquet":
      return <FileIcon {...iconProps} color="#3182CE" />;
    case "arrow":
      return <FileIcon {...iconProps} color="#805AD5" />;
    default:
      return <FileIcon {...iconProps} color="#718096" />;
  }
};

interface FileDetailsProps {
  file: File;
  tableName: string;
  onTableNameChange: (name: string) => void;
  status: FileImportState;
  onRemove: () => void;
}

const FileDetails: React.FC<FileDetailsProps> = ({
  file,
  tableName,
  onTableNameChange,
  status,
  onRemove,
}) => {
  const fileType = file.name.split(".").pop()?.toLowerCase() || "";
  const lastModified = new Date(file.lastModified);

  return (
    <div className=" rounded-lg border p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">{getFileIcon(fileType)}</div>

        <div className="flex-grow space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-lg">{file.name}</h3>
              <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <HardDrive className="w-4 h-4" />
                      {formatFileSize(file.size)}
                    </TooltipTrigger>
                    <TooltipContent>File size</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {format(lastModified, "MMM dd, yyyy")}
                    </TooltipTrigger>
                    <TooltipContent>Last modified</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <span className="uppercase bg-gray-100 px-2 py-0.5 rounded text-xs">
                  {fileType}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="tablename">
              <AccordionTrigger className="text-sm">
                Table Configuration
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  <Label htmlFor={`table-${file.name}`}>Table Name</Label>
                  <Input
                    id={`table-${file.name}`}
                    value={tableName}
                    required
                    onChange={(e) => onTableNameChange(e.target.value)}
                    placeholder="Enter table name"
                    className="max-w-md p-2 ml-1"
                  />
                  <p className="text-sm text-gray-500">
                    This name will be used to reference the table in SQL queries
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Status Indicators */}
          {status.status === "success" && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded">
              <FileCheck className="w-4 h-4" />
              <span className="text-sm">Successfully imported</span>
            </div>
          )}

          {status.status === "processing" && (
            <div className="flex items-center gap-2 text-blue-600 bg-blue-50 p-2 rounded">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Processing...</span>
            </div>
          )}

          {status.status === "error" && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-2 rounded">
              <FileWarning className="w-4 h-4" />
              <span className="text-sm">{status.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FileImporter: React.FC<FileImporterProps> = ({
  isSheetOpen,
  setIsSheetOpen,
  context,
}) => {
  const { importFile } = useDuckStore();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState<string[]>([]);
  const [importStates, setImportStates] = useState<
    Record<string, FileImportState>
  >({});

  const validateFile = (file: File): UploadError | null => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (!extension || !SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
      return {
        id: crypto.randomUUID(),
        file: file.name,
        message: `Unsupported file type: .${extension}`,
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        id: crypto.randomUUID(),
        file: file.name,
        message: `File too large (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)`,
      };
    }

    return null;
  };

  const updateImportState = (
    fileName: string,
    state: Partial<FileImportState>
  ) => {
    setImportStates((prev) => ({
      ...prev,
      [fileName]: {
        ...prev[fileName],
        ...state,
      },
    }));
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setErrors([]);
    const newErrors: UploadError[] = [];
    const validFiles: FileWithPreview[] = [];

    acceptedFiles.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        newErrors.push(error);
      } else {
        validFiles.push(
          Object.assign(file, {
            preview: URL.createObjectURL(file),
          })
        );
      }
    });

    if (newErrors.length > 0) {
      setErrors(newErrors);
    }

    setFiles(validFiles);

    // Generate default table names
    const newTableNames = validFiles.reduce<Record<string, string>>(
      (acc, file) => ({
        ...acc,
        [file.name]: file.name
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase(),
      }),
      {}
    );

    setTableNames((prev) => ({ ...prev, ...newTableNames }));

    // Initialize import states
    const initialImportStates = validFiles.reduce<
      Record<string, FileImportState>
    >((acc, file) => {
      acc[file.name] = {
        fileName: file.name,
        status: "pending",
      };
      return acc;
    }, {});
    setImportStates(initialImportStates);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxSize: MAX_FILE_SIZE,
  });

  const handleFileUpload = async () => {
    setIsUploading(true);
    setErrors([]);
    setUploadSuccess([]);

    for (const file of files) {
      updateImportState(file.name, { status: "processing" });

      try {
        const cleanTableName = tableNames[file.name];
        if (!cleanTableName) {
          throw new Error("Table name is required");
        }

        const fileContent = await file.arrayBuffer();
        const fileType = file.name.split(".").pop()?.toLowerCase() || "";
        await importFile(file.name, fileContent, cleanTableName, fileType);
        updateImportState(file.name, { status: "success" });
        setUploadSuccess((prev) => [...prev, file.name]);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        updateImportState(file.name, {
          status: "error",
          error: errorMessage,
        });
        setErrors((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            message: errorMessage,
            file: file.name,
          },
        ]);
      }
    }

    setIsUploading(false);
    if (errors.length === 0) {
      setIsSheetOpen(false);
      setFiles([]);
      setTableNames({});
    }
  };

  const removeFile = useCallback(
    (fileName: string) => {
      setFiles((prev) => prev.filter((file) => file.name !== fileName));
      setTableNames((prev) => {
        const newNames = { ...prev };
        delete newNames[fileName];
        return newNames;
      });
      setErrors((prev) => prev.filter((error) => error.file !== fileName));
      setUploadSuccess((prev) => prev.filter((name) => name !== fileName));
      setImportStates((prev) => {
        const newStates = { ...prev };
        delete newStates[fileName];
        return newStates;
      });

      // Cleanup preview URL
      const file = files.find((f) => f.name === fileName);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
    },
    [files]
  );

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      {context === "empty" && (
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full mt-4">
            Import Files
          </Button>
        </SheetTrigger>
      )}
      {context === "notEmpty" && (
        <SheetTrigger asChild>
          <Button size="icon" variant="ghost">
            <UploadIcon className="w-6 h-6" />
          </Button>
        </SheetTrigger>
      )}

      <SheetContent className="xl:w-[800px] sm:w-full sm:max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import Data Files</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />
        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200 min-h-[200px] flex flex-col items-center justify-center
              ${
                isDragActive
                  ? "border-[#ffe814] bg-[#ffe814]/10"
                  : "border-gray-300 hover:border-[#ffe814] hover:bg-[#ffe814]/10"
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload
              className={`w-12 h-12 mb-4 ${
                isDragActive ? "text-[#ffe814]" : "text-[#a0aec0]"
              }`}
            />
            {isDragActive ? (
              <p className="text-blue-500 font-medium">
                Drop the files here ...
              </p>
            ) : (
              <div className="space-y-2">
                <p className="font-medium">
                  Drag & drop files here, or click to select files
                </p>
                <p className="text-sm text-gray-500">
                  Supported formats: CSV, JSON, Parquet and Arrow (Max 1GB)
                </p>
              </div>
            )}
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Files to Import</h3>
              <div className="space-y-3">
                {files.map((file) => (
                  <FileDetails
                    key={file.name}
                    file={file}
                    tableName={tableNames[file.name] || ""}
                    onTableNameChange={(name) =>
                      setTableNames((prev) => ({
                        ...prev,
                        [file.name]: name,
                      }))
                    }
                    status={
                      importStates[file.name] || {
                        status: "pending",
                        fileName: file.name,
                      }
                    }
                    onRemove={() => removeFile(file.name)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error Messages */}
          {errors
            .filter((error) => !error.file)
            .map((error) => (
              <Alert variant="destructive" key={error.id}>
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ))}

          {/* Upload Button */}
          {files.length > 0 && (
            <Button
              onClick={handleFileUpload}
              disabled={isUploading || files.length === 0}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing Files...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import {files.length} {files.length === 1 ? "File" : "Files"}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </SheetContent>
    </Sheet>
  );
};

export default FileImporter;
