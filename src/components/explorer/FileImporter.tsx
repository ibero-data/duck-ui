import React, {
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
} from "react";
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
  AlertTriangle,
  RefreshCw,
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
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { z } from "zod";
import { toast } from "sonner";

// Constants
const ACCEPTED_FILE_TYPES = {
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/octet-stream": [".parquet", ".arrow"],
  "application/vnd.duckdb": [".duckdb"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
} as const;

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const SUPPORTED_FILE_EXTENSIONS = [
  "csv",
  "json",
  "parquet",
  "arrow",
  "duckdb",
  "xlsx",
] as const;
const MAX_CONCURRENT_UPLOADS = 3;

// Types
type FileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

interface FileWithPreview extends File {
  preview?: string;
}

interface UploadError {
  id: string;
  message: string;
  file?: string;
  severity: "error" | "warning";
}

interface FileImportState {
  fileName: string;
  status: "pending" | "uploading" | "processing" | "success" | "error";
  progress?: number;
  error?: string;
}

// CSV import options
interface CsvImportOptions {
  ignoreErrors: boolean;
  nullPadding: boolean;
  allVarchar: boolean;
  header: boolean;
  delimiter: string;
  autoDetect: boolean;
}

interface FileImporterProps {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  context?: string;
}

interface FileDetailsProps {
  file: FileWithPreview;
  tableName: string;
  onTableNameChange: (name: string) => void;
  status: FileImportState;
  onRemove: () => void;
  onRetry: () => void;
  csvOptions?: CsvImportOptions;
  onCsvOptionsChange?: (options: CsvImportOptions) => void;
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
    case "duckdb":
      return <FileIcon {...iconProps} color="#ED8936" />;
    case "xlsx":
      return <FileIcon {...iconProps} color="#4299E1" />;
    default:
      return <FileIcon {...iconProps} color="#718096" />;
  }
};

// Zod Schema for Table Name Validation
const tableNameSchema = z
  .string()
  .trim()
  .min(1, "Table name cannot be empty")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Table name can only contain letters, numbers, and underscores"
  );

const FileDetails: React.FC<FileDetailsProps> = ({
  file,
  tableName,
  onTableNameChange,
  status,
  onRemove,
  onRetry,
  csvOptions,
  onCsvOptionsChange,
}) => {
  const [tableNameError, setTableNameError] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const fileType = file.name.split(".").pop()?.toLowerCase() || "";
  const lastModified = new Date(file.lastModified);
  const isCsvFile = fileType === "csv";

  useEffect(() => {
    try {
      tableNameSchema.parse(tableName);
      setTableNameError(null);
    } catch (error) {
      setTableNameError(
        error instanceof z.ZodError
          ? error.errors[0].message
          : "Invalid table name"
      );
    }
  }, [tableName]);

  // Handle CSV option changes
  const handleCsvOptionChange = (key: keyof CsvImportOptions, value: any) => {
    if (onCsvOptionsChange && csvOptions) {
      onCsvOptionsChange({
        ...csvOptions,
        [key]: value,
      });
    }
  };

  return (
    <div className="rounded-lg border p-4 shadow-sm">
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

                <span className="uppercase px-2 py-0.5 rounded text-xs">
                  {fileType}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status.status === "error" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRetry}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`table-${file.name}`}>Table Name</Label>
            <Input
              id={`table-${file.name}`}
              value={tableName}
              required
              onChange={(e) => onTableNameChange(e.target.value)}
              placeholder="Enter table name"
              className="max-w-md p-2 ml-1"
              disabled={
                status.status === "uploading" || status.status === "processing"
              }
            />
            {tableNameError && (
              <p className="text-sm text-red-500">{tableNameError}</p>
            )}
            <p className="text-sm text-gray-500">
              This name will be used to reference the table in SQL queries
            </p>
          </div>

          {/* CSV import options */}
          {isCsvFile && csvOptions && (
            <div className="mt-4 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-medium text-sm">CSV Import Options</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                >
                  {showAdvancedOptions ? "Hide Options" : "Show Options"}
                </Button>
              </div>

              {showAdvancedOptions && (
                <div className="p-3 rounded-md space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`header-${file.name}`}
                        checked={csvOptions.header}
                        onChange={(e) =>
                          handleCsvOptionChange("header", e.target.checked)
                        }
                        disabled={
                          status.status === "uploading" ||
                          status.status === "processing"
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label
                        htmlFor={`header-${file.name}`}
                        className="text-sm"
                      >
                        Has header row
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`auto-detect-${file.name}`}
                        checked={csvOptions.autoDetect}
                        onChange={(e) =>
                          handleCsvOptionChange("autoDetect", e.target.checked)
                        }
                        disabled={
                          status.status === "uploading" ||
                          status.status === "processing"
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label
                        htmlFor={`auto-detect-${file.name}`}
                        className="text-sm"
                      >
                        Auto-detect types
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`ignore-errors-${file.name}`}
                        checked={csvOptions.ignoreErrors}
                        onChange={(e) =>
                          handleCsvOptionChange(
                            "ignoreErrors",
                            e.target.checked
                          )
                        }
                        disabled={
                          status.status === "uploading" ||
                          status.status === "processing"
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label
                        htmlFor={`ignore-errors-${file.name}`}
                        className="text-sm"
                      >
                        Ignore errors
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`null-padding-${file.name}`}
                        checked={csvOptions.nullPadding}
                        onChange={(e) =>
                          handleCsvOptionChange("nullPadding", e.target.checked)
                        }
                        disabled={
                          status.status === "uploading" ||
                          status.status === "processing"
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label
                        htmlFor={`null-padding-${file.name}`}
                        className="text-sm"
                      >
                        Pad missing columns
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`delimiter-${file.name}`}
                      className="text-sm"
                    >
                      Delimiter
                    </Label>
                    <div className="max-w-xs">
                      <Input
                        id={`delimiter-${file.name}`}
                        value={csvOptions.delimiter}
                        onChange={(e) =>
                          handleCsvOptionChange("delimiter", e.target.value)
                        }
                        placeholder="Delimiter character"
                        className="h-8"
                        disabled={
                          status.status === "uploading" ||
                          status.status === "processing"
                        }
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Common values: , (comma), ; (semicolon), tab, pipe (|)
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {status.status === "uploading" && status.progress !== undefined && (
            <div className="flex flex-col space-y-2">
              <span className="text-sm text-gray-500">
                Uploading... {status.progress}%
              </span>
              <Progress value={status.progress} />
            </div>
          )}

          {status.status === "success" && (
            <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded max-w-md ">
              <FileCheck className="w-4 h-4" />
              <span className="text-sm">Successfully imported</span>
            </div>
          )}

          {status.status === "error" && status.error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-500/20 p-2 rounded max-w-md">
              <FileWarning className="w-4 h-4" />
              <span className="text-xs">{status.error}</span>
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
}) => {
  const { importFile } = useDuckStore();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [importStates, setImportStates] = useState<
    Record<string, FileImportState>
  >({});
  const [csvOptions, setCsvOptions] = useState<
    Record<string, CsvImportOptions>
  >({});
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Default CSV import options
  const defaultCsvOptions: CsvImportOptions = {
    ignoreErrors: true,
    nullPadding: true,
    allVarchar: false,
    header: true,
    delimiter: ",",
    autoDetect: true,
  };

  const hasFilesToImport = useMemo(() => files.length > 0, [files]);

  const allFilesSuccess = useMemo(() => {
    if (!files.length) return false;
    return files.every((file) => importStates[file.name]?.status === "success");
  }, [files, importStates]);

  const validateFile = (file: File): UploadError[] => {
    const errors: UploadError[] = [];
    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase() as FileExtension;

    if (!extension || !SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
      errors.push({
        id: crypto.randomUUID(),
        file: file.name,
        message: `Unsupported file type: .${extension}`,
        severity: "error",
      });
      toast.error(`Unsupported file type: .${extension}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        id: crypto.randomUUID(),
        file: file.name,
        message: `File exceeds maximum size of ${formatFileSize(
          MAX_FILE_SIZE
        )}`,
        severity: "error",
      });
      toast.warning(
        `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`
      );
    }

    return errors;
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

  const onFileChange = useCallback(
    (newFiles: File[]) => {
      setErrors([]);
      const newErrors: UploadError[] = [];
      const validFiles: FileWithPreview[] = [];

      newFiles.forEach((file) => {
        const fileErrors = validateFile(file);
        if (fileErrors.length > 0) {
          newErrors.push(...fileErrors);
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

      setFiles((prevFiles) => [...prevFiles, ...validFiles]);

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

      // Initialize CSV options for any CSV files
      const newCsvOptions = validFiles.reduce<Record<string, CsvImportOptions>>(
        (acc, file) => {
          const extension = file.name.split(".").pop()?.toLowerCase();
          if (extension === "csv") {
            acc[file.name] = { ...defaultCsvOptions };
          }
          return acc;
        },
        {}
      );

      setCsvOptions((prev) => ({ ...prev, ...newCsvOptions }));

      const initialImportStates = validFiles.reduce<
        Record<string, FileImportState>
      >((acc, file) => {
        acc[file.name] = {
          fileName: file.name,
          status: "pending",
        };
        return acc;
      }, {});

      setImportStates((prev) => ({ ...prev, ...initialImportStates }));
    },
    [toast]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      if (!event.dataTransfer.files || event.dataTransfer.files.length === 0)
        return;
      onFileChange(Array.from(event.dataTransfer.files));
    },
    [onFileChange]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
    },
    []
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        onFileChange(Array.from(event.target.files));
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onFileChange]
  );

  const handleFileUpload = async () => {
    setIsUploading(true);
    setErrors([]);

    try {
      const uploadPromises = files.map(async (file) => {
        const state = importStates[file.name];
        if (state?.status === "success") return;

        const cleanTableName = tableNames[file.name];
        try {
          tableNameSchema.parse(cleanTableName);
        } catch (error) {
          const errorMessage =
            error instanceof z.ZodError
              ? error.errors[0].message
              : "Invalid table name";
          setErrors((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              message: errorMessage,
              file: file.name,
              severity: "error",
            },
          ]);
          updateImportState(file.name, {
            status: "error",
            error: errorMessage,
          });
          toast.error(`Invalid table name for ${file.name}`);
          return;
        }

        updateImportState(file.name, { status: "processing" });

        try {
          const fileType = file.name
            .split(".")
            .pop()
            ?.toLowerCase() as FileExtension;
          const arrayBuffer = await file.arrayBuffer();

          // Add options for CSV files
          const importOptions: Record<string, any> = {};
          if (fileType === "csv" && csvOptions[file.name]) {
            importOptions.csv = csvOptions[file.name];
          }

          await importFile(
            file.name,
            arrayBuffer,
            cleanTableName,
            fileType,
            undefined,
            importOptions
          );
          updateImportState(file.name, { status: "success" });
          toast.success(`Successfully imported ${file.name}`);
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : "Unknown error";
          updateImportState(file.name, {
            status: "error",
            error: errorMessage,
          });
          setErrors((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              message: errorMessage,
              file:
                errorMessage === "File processing aborted"
                  ? undefined
                  : file.name,
              severity: "error",
            },
          ]);
          toast.error(`Error importing ${file.name}`);
        }
      });

      // Run promises with concurrency control
      const concurrencyQueue = [];
      for (let i = 0; i < uploadPromises.length; i += MAX_CONCURRENT_UPLOADS) {
        const chunk = uploadPromises.slice(i, i + MAX_CONCURRENT_UPLOADS);
        concurrencyQueue.push(Promise.all(chunk));
      }

      await Promise.all(concurrencyQueue);

      if (allFilesSuccess) {
        setIsSheetOpen(false);
        setFiles([]);
        setTableNames({});
        setImportStates({});
        toast.success("All files imported successfully");
      }
    } catch (e) {
      console.error("Error uploading: ", e);
      toast.error("Error uploading files");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsUploading(false);
    toast.warning("Upload cancelled");
  }, [toast]);

  const removeFile = useCallback(
    (fileName: string) => {
      setFiles((prev) => prev.filter((file) => file.name !== fileName));
      setTableNames((prev) => {
        const newNames = { ...prev };
        delete newNames[fileName];
        return newNames;
      });
      setErrors((prev) => prev.filter((error) => error.file !== fileName));
      setImportStates((prev) => {
        const newStates = { ...prev };
        delete newStates[fileName];
        return newStates;
      });

      const file = files.find((f) => f.name === fileName);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }

      toast.info(`Removed ${fileName}`);
    },
    [files, toast]
  );

  const retryFileUpload = useCallback(
    (fileName: string) => {
      setImportStates((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          status: "pending",
          error: undefined,
        },
      }));
      toast.info(`Retrying upload for ${fileName}`);
    },
    [toast]
  );

  useEffect(() => {
    return () => {
      files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      <SheetContent className="xl:w-[800px] sm:w-full sm:max-w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Import Data Files</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer",
              "transition-colors duration-200 min-h-[200px] flex flex-col items-center justify-center",
              isDragActive
                ? "border-[#ffe814] bg-[#ffe814]/10"
                : "border-gray-300 hover:border-[#ffe814] hover:bg-[#ffe814]/10"
            )}
          >
            <Input
              type="file"
              multiple
              hidden
              ref={fileInputRef}
              accept={Object.values(ACCEPTED_FILE_TYPES).flat().join(",")}
              onChange={handleFileInputChange}
            />
            <Upload
              className={cn(
                "w-12 h-12 mb-4 mt-4",
                isDragActive ? "text-[#ffe814]" : "text-[#a0aec0]"
              )}
            />
            {isDragActive ? (
              <p className="text-blue-500 font-medium">
                Drop the files here ...
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="font-medium">
                    Drag & drop files here, or
                    <div>
                      <Button
                        variant="outline"
                        className="mt-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Select Files
                      </Button>
                    </div>
                  </p>
                  <p className="text-sm text-gray-500">
                    Supported formats: CSV, JSON, Parquet, Arrow and DuckDB
                  </p>
                  <p className="text-xs text-gray-400">
                    Maximum file size: {formatFileSize(MAX_FILE_SIZE)}
                  </p>
                </div>
              </>
            )}
          </div>

          {hasFilesToImport && (
            <div className="space-y-4">
              <h3 className="font-medium text-lg">Files to Import</h3>
              <div className="space-y-3">
                {files.map((file) => {
                  const fileType = file.name.split(".").pop()?.toLowerCase();
                  const isCsvFile = fileType === "csv";

                  return (
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
                          fileName: file.name,
                          status: "pending",
                        }
                      }
                      csvOptions={isCsvFile ? csvOptions[file.name] : undefined}
                      onCsvOptionsChange={
                        isCsvFile
                          ? (options) =>
                              setCsvOptions((prev) => ({
                                ...prev,
                                [file.name]: options,
                              }))
                          : undefined
                      }
                      onRemove={() => removeFile(file.name)}
                      onRetry={() => retryFileUpload(file.name)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2">
              {errors.map((error) => (
                <Alert
                  key={error.id}
                  variant={
                    error.severity === "error" ? "destructive" : "default"
                  }
                >
                  <AlertTitle className="flex items-center gap-2">
                    {error.severity === "error" ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <FileWarning className="h-4 w-4" />
                    )}
                    {error.severity === "error" ? "Error" : "Warning"}
                  </AlertTitle>
                  <AlertDescription>
                    {error.file
                      ? `${error.file}: ${error.message}`
                      : error.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {hasFilesToImport && (
            <div className="flex gap-2">
              <Button
                onClick={handleFileUpload}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing Files...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {files.length}{" "}
                    {files.length === 1 ? "File" : "Files"}
                  </>
                )}
              </Button>

              {isUploading && (
                <Button
                  variant="destructive"
                  onClick={handleCancelUpload}
                  className="whitespace-nowrap"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </SheetContent>
    </Sheet>
  );
};

export default FileImporter;
