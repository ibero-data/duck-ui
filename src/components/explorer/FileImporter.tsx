import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
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
  Link as LinkIcon,
  Link2,
  Code,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Table,
} from "lucide-react";
import { useDuckStore, type QueryResult } from "@/store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DuckUITable from "@/components/table/DuckUItable";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn, generateUUID } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { z } from "zod";
import { toast } from "sonner";

// Constants
const ACCEPTED_FILE_TYPES = {
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/octet-stream": [".parquet", ".arrow", ".db", ".ddb"],
  "application/vnd.duckdb": [".duckdb", ".db", ".ddb"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
} as const;

const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
const SUPPORTED_FILE_EXTENSIONS = [
  "csv",
  "json",
  "parquet",
  "arrow",
  "duckdb",
  "db",
  "ddb",
  "xlsx",
] as const;
const MAX_CONCURRENT_UPLOADS = 3;
const PREVIEW_ROW_LIMIT = 20;

// DuckDB types for schema customization
const DUCKDB_TYPES = [
  "VARCHAR",
  "INTEGER",
  "BIGINT",
  "DOUBLE",
  "DECIMAL",
  "DATE",
  "TIMESTAMP",
  "BOOLEAN",
  "JSON",
  "BLOB",
] as const;

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
  // Advanced options
  quote?: string;
  escape?: string;
  skip?: number;
  nullStr?: string;
  dateFormat?: string;
  timestampFormat?: string;
  sampleSize?: number;
}

// Schema customization
interface SchemaColumn {
  originalName: string;
  newName: string;
  type: string;
  included: boolean;
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

const getErrorSuggestion = (errorMessage: string): string | null => {
  const lowerError = errorMessage.toLowerCase();

  // Network/URL errors
  if (
    lowerError.includes("fetch") ||
    lowerError.includes("network") ||
    lowerError.includes("cors")
  ) {
    return "Check your internet connection and ensure the URL is publicly accessible. CORS restrictions may prevent access to some URLs.";
  }

  // File format errors
  if (
    lowerError.includes("invalid") &&
    (lowerError.includes("csv") || lowerError.includes("json") || lowerError.includes("parquet"))
  ) {
    return "The file format may be corrupted or not match the expected structure. Try opening the file locally to verify its contents.";
  }

  // Parsing errors
  if (lowerError.includes("parse") || lowerError.includes("syntax")) {
    return "Data parsing failed. Consider adjusting CSV options like delimiter, quote character, or enabling 'ignore errors'.";
  }

  // Type detection errors
  if (lowerError.includes("type") || lowerError.includes("column")) {
    return "Column type detection failed. Try enabling 'auto-detect types' or manually specify column types in schema customization.";
  }

  // Authentication errors
  if (
    lowerError.includes("401") ||
    lowerError.includes("403") ||
    lowerError.includes("unauthorized")
  ) {
    return "Access denied. The URL may require authentication or the resource is not publicly accessible.";
  }

  // Not found errors
  if (lowerError.includes("404") || lowerError.includes("not found")) {
    return "The file was not found at the specified URL. Verify the URL is correct and the file still exists.";
  }

  // Memory/size errors
  if (lowerError.includes("memory") || lowerError.includes("out of")) {
    return "The file may be too large to process. Try importing a smaller file or use sampling options.";
  }

  // Table name errors
  if (lowerError.includes("table") && lowerError.includes("exist")) {
    return "A table with this name already exists. Choose a different name or the existing table will be replaced.";
  }

  return null;
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
  .regex(/^[a-zA-Z0-9_]+$/, "Table name can only contain letters, numbers, and underscores");

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
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name"
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

                <span className="uppercase px-2 py-0.5 rounded text-xs">{fileType}</span>
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
              disabled={status.status === "uploading" || status.status === "processing"}
            />
            {tableNameError && <p className="text-sm text-red-500">{tableNameError}</p>}
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
                        onChange={(e) => handleCsvOptionChange("header", e.target.checked)}
                        disabled={status.status === "uploading" || status.status === "processing"}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`header-${file.name}`} className="text-sm">
                        Has header row
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`auto-detect-${file.name}`}
                        checked={csvOptions.autoDetect}
                        onChange={(e) => handleCsvOptionChange("autoDetect", e.target.checked)}
                        disabled={status.status === "uploading" || status.status === "processing"}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`auto-detect-${file.name}`} className="text-sm">
                        Auto-detect types
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`ignore-errors-${file.name}`}
                        checked={csvOptions.ignoreErrors}
                        onChange={(e) => handleCsvOptionChange("ignoreErrors", e.target.checked)}
                        disabled={status.status === "uploading" || status.status === "processing"}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`ignore-errors-${file.name}`} className="text-sm">
                        Ignore errors
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`null-padding-${file.name}`}
                        checked={csvOptions.nullPadding}
                        onChange={(e) => handleCsvOptionChange("nullPadding", e.target.checked)}
                        disabled={status.status === "uploading" || status.status === "processing"}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`null-padding-${file.name}`} className="text-sm">
                        Pad missing columns
                      </Label>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`delimiter-${file.name}`} className="text-sm">
                      Delimiter
                    </Label>
                    <div className="max-w-xs">
                      <Input
                        id={`delimiter-${file.name}`}
                        value={csvOptions.delimiter}
                        onChange={(e) => handleCsvOptionChange("delimiter", e.target.value)}
                        placeholder="Delimiter character"
                        className="h-8"
                        disabled={status.status === "uploading" || status.status === "processing"}
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      Common values: , (comma), ; (semicolon), tab, pipe (|)
                    </p>
                  </div>

                  {/* Advanced CSV Options */}
                  <div className="space-y-3 pt-3 border-t">
                    <h5 className="font-medium text-sm text-muted-foreground">Advanced Options</h5>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`quote-${file.name}`} className="text-xs">
                          Quote Character
                        </Label>
                        <Input
                          id={`quote-${file.name}`}
                          value={csvOptions.quote || ""}
                          onChange={(e) => handleCsvOptionChange("quote", e.target.value)}
                          placeholder={`" (default)`}
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`escape-${file.name}`} className="text-xs">
                          Escape Character
                        </Label>
                        <Input
                          id={`escape-${file.name}`}
                          value={csvOptions.escape || ""}
                          onChange={(e) => handleCsvOptionChange("escape", e.target.value)}
                          placeholder={`" (default)`}
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`skip-${file.name}`} className="text-xs">
                          Skip Rows
                        </Label>
                        <Input
                          id={`skip-${file.name}`}
                          type="number"
                          min="0"
                          value={csvOptions.skip || ""}
                          onChange={(e) =>
                            handleCsvOptionChange("skip", parseInt(e.target.value, 10) || undefined)
                          }
                          placeholder="0"
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`sample-size-${file.name}`} className="text-xs">
                          Sample Size
                        </Label>
                        <Input
                          id={`sample-size-${file.name}`}
                          type="number"
                          min="1"
                          value={csvOptions.sampleSize || ""}
                          onChange={(e) =>
                            handleCsvOptionChange(
                              "sampleSize",
                              parseInt(e.target.value, 10) || undefined
                            )
                          }
                          placeholder="Auto"
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`null-str-${file.name}`} className="text-xs">
                        NULL String
                      </Label>
                      <Input
                        id={`null-str-${file.name}`}
                        value={csvOptions.nullStr || ""}
                        onChange={(e) => handleCsvOptionChange("nullStr", e.target.value)}
                        placeholder="Empty values treated as NULL"
                        className="h-8 text-xs"
                        disabled={status.status === "uploading" || status.status === "processing"}
                      />
                      <p className="text-xs text-muted-foreground">
                        Values matching this string will be treated as NULL
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`date-format-${file.name}`} className="text-xs">
                          Date Format
                        </Label>
                        <Input
                          id={`date-format-${file.name}`}
                          value={csvOptions.dateFormat || ""}
                          onChange={(e) => handleCsvOptionChange("dateFormat", e.target.value)}
                          placeholder="ISO 8601"
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor={`timestamp-format-${file.name}`} className="text-xs">
                          Timestamp Format
                        </Label>
                        <Input
                          id={`timestamp-format-${file.name}`}
                          value={csvOptions.timestampFormat || ""}
                          onChange={(e) => handleCsvOptionChange("timestampFormat", e.target.value)}
                          placeholder="ISO 8601"
                          className="h-8 text-xs"
                          disabled={status.status === "uploading" || status.status === "processing"}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {status.status === "uploading" && status.progress !== undefined && (
            <div className="flex flex-col space-y-2">
              <span className="text-sm text-gray-500">Uploading... {status.progress}%</span>
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

const FileImporter: React.FC<FileImporterProps> = ({ isSheetOpen, setIsSheetOpen }) => {
  const { importFile, executeQuery } = useDuckStore();
  const [activeTab, setActiveTab] = useState("upload");
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [tableNames, setTableNames] = useState<Record<string, string>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<UploadError[]>([]);
  const [importStates, setImportStates] = useState<Record<string, FileImportState>>({});
  const [csvOptions, setCsvOptions] = useState<Record<string, CsvImportOptions>>({});
  const [isDragActive, setIsDragActive] = useState(false);
  const [importMode, setImportMode] = useState<"table" | "view">("table");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // URL import state
  const [urlInput, setUrlInput] = useState("");
  const [urlTableName, setUrlTableName] = useState("");
  const [isUrlImporting, setIsUrlImporting] = useState(false);

  // Preview state (Phase 2 - used in PreviewTable component)
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<QueryResult | null>(null);
  const [previewSource, setPreviewSource] = useState<"file" | "url" | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewTableName, setPreviewTableName] = useState<string>("");

  // Schema customization state (Phase 2 - used in SchemaEditor component)
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>([]);
  const [isSchemaCustomizing, setIsSchemaCustomizing] = useState(false);

  // Query import state (Phase 2 - Query Import feature)
  const [queryInput, setQueryInput] = useState("");
  const [queryTableName, setQueryTableName] = useState("");
  const [isQueryImporting, setIsQueryImporting] = useState(false);

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
    const extension = file.name.split(".").pop()?.toLowerCase() as FileExtension;

    if (!extension || !SUPPORTED_FILE_EXTENSIONS.includes(extension)) {
      errors.push({
        id: generateUUID(),
        file: file.name,
        message: `Unsupported file type: .${extension}`,
        severity: "error",
      });
      toast.error(`Unsupported file type: .${extension}`);
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        id: generateUUID(),
        file: file.name,
        message: `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`,
        severity: "error",
      });
      toast.warning(`File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`);
    }

    return errors;
  };

  const updateImportState = (fileName: string, state: Partial<FileImportState>) => {
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
      const newCsvOptions = validFiles.reduce<Record<string, CsvImportOptions>>((acc, file) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        if (extension === "csv") {
          acc[file.name] = { ...defaultCsvOptions };
        }
        return acc;
      }, {});

      setCsvOptions((prev) => ({ ...prev, ...newCsvOptions }));

      const initialImportStates = validFiles.reduce<Record<string, FileImportState>>(
        (acc, file) => {
          acc[file.name] = {
            fileName: file.name,
            status: "pending",
          };
          return acc;
        },
        {}
      );

      setImportStates((prev) => ({ ...prev, ...initialImportStates }));
    },
    [toast]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      if (!event.dataTransfer.files || event.dataTransfer.files.length === 0) return;
      onFileChange(Array.from(event.dataTransfer.files));
    },
    [onFileChange]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  }, []);

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
            error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
          setErrors((prev) => [
            ...prev,
            {
              id: generateUUID(),
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
          const fileType = file.name.split(".").pop()?.toLowerCase() as FileExtension;
          const arrayBuffer = await file.arrayBuffer();

          // Add options for import
          const importOptions: Record<string, any> = {
            importMode, // "table" or "view"
          };
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
              id: generateUUID(),
              message: errorMessage,
              file: errorMessage === "File processing aborted" ? undefined : file.name,
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

  // Preview handlers - Phase 2
  const handlePreviewUrl = async (url: string, tableName: string) => {
    setIsPreviewing(true);
    setErrors([]);

    try {
      const urlPath = url.split("?")[0];
      const extension = urlPath.split(".").pop()?.toLowerCase();

      let previewQuery = "";
      if (extension === "csv") {
        previewQuery = `SELECT * FROM read_csv('${url}', auto_detect=true, header=true) LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else if (extension === "json") {
        previewQuery = `SELECT * FROM read_json('${url}', auto_detect=true) LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else if (extension === "parquet") {
        previewQuery = `SELECT * FROM read_parquet('${url}') LIMIT ${PREVIEW_ROW_LIMIT}`;
      } else {
        throw new Error(`Unsupported file type for preview: .${extension}`);
      }

      const result = await executeQuery(previewQuery);
      if (result && !result.error) {
        setPreviewData(result);
        setPreviewSource("url");
        setPreviewFileName(url);
        setPreviewTableName(tableName);
        setIsPreviewMode(true);

        // Initialize schema columns from preview
        const initialSchema: SchemaColumn[] = result.columns.map((col, idx) => ({
          originalName: col,
          newName: col,
          type: result.columnTypes[idx] || "VARCHAR",
          included: true,
        }));
        setSchemaColumns(initialSchema);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Preview failed: ${errorMessage}`);
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
    } finally {
      setIsPreviewing(false);
    }
  };

  // Wrapper for preview with validation
  const handlePreview = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!urlTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(urlTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    await handlePreviewUrl(urlInput, urlTableName);
  };

  // Exit preview mode
  const handleBackFromPreview = () => {
    setIsPreviewMode(false);
    setPreviewData(null);
    setPreviewSource(null);
    setPreviewFileName("");
    setPreviewTableName("");
    setSchemaColumns([]);
  };

  // Import from preview (with optional schema customization)
  const handleImportFromPreview = async () => {
    if (!previewFileName || !previewTableName) return;

    setIsUrlImporting(true);
    setErrors([]);

    try {
      if (previewSource === "url") {
        const url = previewFileName;
        const urlPath = url.split("?")[0];
        const extension = urlPath.split(".").pop()?.toLowerCase();

        // Build column selection and casting based on schema customization
        const includedColumns = schemaColumns.filter((col) => col.included);
        const hasSchemaChanges = schemaColumns.some(
          (col) => col.newName !== col.originalName || !col.included
        );

        let columnSelection = "*";
        if (hasSchemaChanges && includedColumns.length > 0) {
          columnSelection = includedColumns
            .map((col) => {
              if (col.newName !== col.originalName) {
                return `"${col.originalName}" AS "${col.newName}"`;
              }
              return `"${col.originalName}"`;
            })
            .join(", ");
        }

        let query = "";
        const createType = importMode === "view" ? "VIEW" : "TABLE";
        const resultType = importMode === "view" ? "view" : "table";

        if (extension === "csv") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_csv('${url}', auto_detect=true, ignore_errors=true, header=true)`;
        } else if (extension === "json") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_json('${url}', auto_detect=true, ignore_errors=true)`;
        } else if (extension === "parquet") {
          query = `CREATE OR REPLACE ${createType} ${previewTableName} AS SELECT ${columnSelection} FROM read_parquet('${url}')`;
        } else {
          throw new Error(`Unsupported file type: .${extension}`);
        }

        await executeQuery(query);
        toast.success(`Successfully created ${resultType} '${previewTableName}'`);

        // Reset state and close sheet
        handleBackFromPreview();
        setIsSheetOpen(false);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
      toast.error(`Failed to import: ${errorMessage}`);
    } finally {
      setIsUrlImporting(false);
    }
  };

  // Schema customization handlers
  const handleToggleColumn = (originalName: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) =>
        col.originalName === originalName ? { ...col, included: !col.included } : col
      )
    );
  };

  const handleRenameColumn = (originalName: string, newName: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) => (col.originalName === originalName ? { ...col, newName } : col))
    );
  };

  const handleChangeColumnType = (originalName: string, type: string) => {
    setSchemaColumns((prev) =>
      prev.map((col) => (col.originalName === originalName ? { ...col, type } : col))
    );
  };

  // Handle URL import
  const handleUrlImport = async () => {
    if (!urlInput.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!urlTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(urlTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    setIsUrlImporting(true);
    setErrors([]);

    try {
      // Detect file type from URL
      const url = urlInput.trim();
      const urlPath = url.split("?")[0]; // Remove query params
      const extension = urlPath.split(".").pop()?.toLowerCase();

      let query = "";

      // Build import query based on file type and import mode
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      if (extension === "csv") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_csv('${url}', auto_detect=true, ignore_errors=true, header=true)`;
      } else if (extension === "json") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_json('${url}', auto_detect=true, ignore_errors=true)`;
      } else if (extension === "parquet") {
        query = `CREATE OR REPLACE ${createType} ${urlTableName} AS SELECT * FROM read_parquet('${url}')`;
      } else {
        throw new Error(`Unsupported file type: .${extension}. Supported: CSV, JSON, Parquet`);
      }

      await executeQuery(query);

      toast.success(`Successfully created ${resultType} '${urlTableName}' from URL`);
      setUrlInput("");
      setUrlTableName("");
      setIsSheetOpen(false);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
      toast.error(`Failed to import from URL: ${errorMessage}`);
    } finally {
      setIsUrlImporting(false);
    }
  };

  // Handle Query Import
  const handleQueryImport = async () => {
    if (!queryInput.trim()) {
      toast.error("Please enter a SQL query");
      return;
    }

    if (!queryTableName.trim()) {
      toast.error("Please enter a table name");
      return;
    }

    try {
      tableNameSchema.parse(queryTableName);
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError ? error.issues[0].message : "Invalid table name";
      toast.error(errorMessage);
      return;
    }

    setIsQueryImporting(true);
    setErrors([]);

    try {
      const userQuery = queryInput.trim();
      const createType = importMode === "view" ? "VIEW" : "TABLE";
      const resultType = importMode === "view" ? "view" : "table";

      // Wrap user query in CREATE statement
      const wrappedQuery = `CREATE OR REPLACE ${createType} ${queryTableName} AS ${userQuery}`;

      await executeQuery(wrappedQuery);

      toast.success(`Successfully created ${resultType} '${queryTableName}' from query result`);
      setQueryInput("");
      setQueryTableName("");
      setIsSheetOpen(false);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      setErrors([
        {
          id: generateUUID(),
          message: errorMessage,
          severity: "error",
        },
      ]);
      toast.error(`Failed to execute query: ${errorMessage}`);
    } finally {
      setIsQueryImporting(false);
    }
  };

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
          <SheetTitle>{isPreviewMode ? "Preview Data" : "Import Data"}</SheetTitle>
        </SheetHeader>
        <Separator className="my-4" />

        {/* Preview Mode UI */}
        {isPreviewMode && previewData && (
          <div className="space-y-4">
            {/* Header with file info and navigation */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1">
                      Preview:{" "}
                      {previewFileName.length > 50
                        ? `...${previewFileName.slice(-47)}`
                        : previewFileName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Table Name: <span className="font-mono">{previewTableName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Showing first {PREVIEW_ROW_LIMIT} rows • {previewData.rowCount} total rows
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleBackFromPreview}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Preview Table */}
            <Card>
              <CardContent className="p-4">
                <DuckUITable data={previewData.data} initialPageSize={20} tableHeight="400px" />
              </CardContent>
            </Card>

            {/* Schema Customization */}
            <Card>
              <CardContent className="p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-base">Schema Customization</h4>
                      <p className="text-sm text-muted-foreground">
                        Customize column names, types, and visibility before importing
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsSchemaCustomizing(!isSchemaCustomizing)}
                    >
                      {isSchemaCustomizing ? (
                        <>
                          <ChevronUp className="w-4 h-4 mr-2" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-2" />
                          Customize
                        </>
                      )}
                    </Button>
                  </div>

                  {isSchemaCustomizing && (
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="p-2 text-left w-12">Include</th>
                              <th className="p-2 text-left">Original Name</th>
                              <th className="p-2 text-left">New Name</th>
                              <th className="p-2 text-left w-48">Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {schemaColumns.map((col) => (
                              <tr
                                key={col.originalName}
                                className={!col.included ? "opacity-50" : ""}
                              >
                                <td className="p-2">
                                  <Checkbox
                                    checked={col.included}
                                    onCheckedChange={() => handleToggleColumn(col.originalName)}
                                  />
                                </td>
                                <td className="p-2">
                                  <code className="text-xs bg-muted px-2 py-1 rounded">
                                    {col.originalName}
                                  </code>
                                </td>
                                <td className="p-2">
                                  <Input
                                    value={col.newName}
                                    onChange={(e) =>
                                      handleRenameColumn(col.originalName, e.target.value)
                                    }
                                    disabled={!col.included}
                                    className="h-8 text-xs"
                                    placeholder="Column name"
                                  />
                                </td>
                                <td className="p-2">
                                  <Select
                                    value={col.type}
                                    onValueChange={(value) =>
                                      handleChangeColumnType(col.originalName, value)
                                    }
                                    disabled={!col.included}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {DUCKDB_TYPES.map((type) => (
                                        <SelectItem key={type} value={type} className="text-xs">
                                          {type}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="p-3 bg-muted/50 text-xs text-muted-foreground">
                        <p>
                          {schemaColumns.filter((col) => col.included).length} of{" "}
                          {schemaColumns.length} columns will be imported
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleBackFromPreview}>
                Cancel
              </Button>
              <Button onClick={handleImportFromPreview} disabled={isUrlImporting}>
                {isUrlImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Import Table
                  </>
                )}
              </Button>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="space-y-2">
                {errors.map((error) => {
                  const suggestion = getErrorSuggestion(error.message);
                  return (
                    <Alert key={error.id} variant="destructive">
                      <AlertTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Error
                      </AlertTitle>
                      <AlertDescription>
                        <div className="space-y-2">
                          <p>{error.message}</p>
                          {suggestion && (
                            <p className="text-sm opacity-90 border-t pt-2 mt-2">
                              <strong>Suggestion:</strong> {suggestion}
                            </p>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Import Tabs (when not in preview mode) */}
        {!isPreviewMode && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="w-4 h-4" />
                Upload Files
              </TabsTrigger>
              <TabsTrigger value="url" className="gap-2">
                <LinkIcon className="w-4 h-4" />
                From URL
              </TabsTrigger>
              <TabsTrigger value="query" className="gap-2">
                <Code className="w-4 h-4" />
                From Query
              </TabsTrigger>
            </TabsList>

            {/* Upload Files Tab */}
            <TabsContent value="upload" className="space-y-4 mt-4">
              <CardContent className="space-y-4 p-0">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer",
                    "transition-colors duration-200 min-h-[200px] flex flex-col items-center justify-center",
                    isDragActive
                      ? "border-primary bg-primary/10"
                      : "border-gray-300 hover:border-primary hover:bg-primary/10"
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
                      isDragActive ? "text-accent" : "text-muted-foreground"
                    )}
                  />
                  {isDragActive ? (
                    <p className="text-blue-500 font-medium">Drop the files here ...</p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <p className="font-medium">Drag & drop files here, or</p>
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                          Select Files
                        </Button>
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
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-lg">Files to Import</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Mode:</span>
                        <div className="flex rounded-md border">
                          <Button
                            variant={importMode === "table" ? "default" : "ghost"}
                            size="sm"
                            className="rounded-r-none h-7 text-xs"
                            onClick={() => setImportMode("table")}
                          >
                            Import (Table)
                          </Button>
                          <Button
                            variant={importMode === "view" ? "default" : "ghost"}
                            size="sm"
                            className="rounded-l-none h-7 text-xs"
                            onClick={() => setImportMode("view")}
                          >
                            Link (View)
                          </Button>
                        </div>
                      </div>
                    </div>
                    {importMode === "view" && (
                      <p className="text-xs text-muted-foreground">
                        Views reference the original file without copying data. Queries re-read the
                        file each time, using less memory but may be slower.
                      </p>
                    )}
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
                    {errors.map((error) => {
                      const suggestion = getErrorSuggestion(error.message);
                      return (
                        <Alert
                          key={error.id}
                          variant={error.severity === "error" ? "destructive" : "default"}
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
                            <div className="space-y-2">
                              <p>
                                {error.file ? `${error.file}: ${error.message}` : error.message}
                              </p>
                              {suggestion && (
                                <p className="text-sm opacity-90 border-t pt-2 mt-2">
                                  <strong>Suggestion:</strong> {suggestion}
                                </p>
                              )}
                            </div>
                          </AlertDescription>
                        </Alert>
                      );
                    })}
                  </div>
                )}

                {hasFilesToImport && (
                  <div className="flex gap-2">
                    <Button onClick={handleFileUpload} disabled={isUploading} className="flex-1">
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
            </TabsContent>

            {/* URL Import Tab */}
            <TabsContent value="url" className="space-y-4 mt-4">
              <CardContent className="space-y-4 p-0">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-lg mb-4">Import from URL</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      DuckDB can directly read files from HTTP/HTTPS URLs. Supports CSV, JSON, and
                      Parquet files.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="url-input">File URL</Label>
                    <Input
                      id="url-input"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com/data.csv"
                      disabled={isUrlImporting || isPreviewing}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a direct URL to a CSV, JSON, or Parquet file
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="url-table-name">Name</Label>
                    <Input
                      id="url-table-name"
                      value={urlTableName}
                      onChange={(e) => setUrlTableName(e.target.value)}
                      placeholder="my_table"
                      disabled={isUrlImporting || isPreviewing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Import Mode</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={importMode === "table" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setImportMode("table")}
                        disabled={isUrlImporting || isPreviewing}
                      >
                        <Table className="h-4 w-4 mr-1.5" />
                        Table
                      </Button>
                      <Button
                        type="button"
                        variant={importMode === "view" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setImportMode("view")}
                        disabled={isUrlImporting || isPreviewing}
                      >
                        <Link2 className="h-4 w-4 mr-1.5" />
                        View
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {importMode === "view"
                        ? "View references URL directly (fresh data, less memory)"
                        : "Table copies data into DuckDB (faster queries)"}
                    </p>
                  </div>

                  {errors.length > 0 && (
                    <div className="space-y-2">
                      {errors.map((error) => {
                        const suggestion = getErrorSuggestion(error.message);
                        return (
                          <Alert key={error.id} variant="destructive">
                            <AlertTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Error
                            </AlertTitle>
                            <AlertDescription>
                              <div className="space-y-2">
                                <p>{error.message}</p>
                                {suggestion && (
                                  <p className="text-sm opacity-90 border-t pt-2 mt-2">
                                    <strong>Suggestion:</strong> {suggestion}
                                  </p>
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={handlePreview}
                      disabled={isUrlImporting || isPreviewing}
                      variant="outline"
                      className="flex-1"
                    >
                      {isPreviewing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading Preview...
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleUrlImport}
                      disabled={isUrlImporting || isPreviewing}
                      className="flex-1"
                    >
                      {isUrlImporting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Import Directly
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </TabsContent>

            {/* Query Import Tab */}
            <TabsContent value="query" className="space-y-4 mt-4">
              <CardContent className="space-y-4 p-0">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-lg mb-4">Import from Query Result</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Execute a SQL query and create a table from the result. Use DuckDB functions
                      like read_csv, read_json, read_parquet, or query existing tables.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="query-input">SQL Query</Label>
                    <Textarea
                      id="query-input"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="SELECT * FROM read_csv('https://example.com/data.csv')"
                      disabled={isQueryImporting}
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter any SELECT query. The result will be saved to a new table.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="query-table-name">Name</Label>
                    <Input
                      id="query-table-name"
                      value={queryTableName}
                      onChange={(e) => setQueryTableName(e.target.value)}
                      placeholder="my_table"
                      disabled={isQueryImporting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Save As</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant={importMode === "table" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setImportMode("table")}
                        disabled={isQueryImporting}
                      >
                        <Table className="h-4 w-4 mr-1.5" />
                        Table
                      </Button>
                      <Button
                        type="button"
                        variant={importMode === "view" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setImportMode("view")}
                        disabled={isQueryImporting}
                      >
                        <Link2 className="h-4 w-4 mr-1.5" />
                        View
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {importMode === "view"
                        ? "View re-runs query each time (always fresh)"
                        : "Table stores result (faster queries)"}
                    </p>
                  </div>

                  {/* Examples */}
                  <div className="rounded-lg border p-4 bg-muted/50">
                    <h4 className="font-medium text-sm mb-2">Example Queries:</h4>
                    <div className="space-y-2 text-xs font-mono">
                      <p className="text-muted-foreground">
                        <span className="text-foreground">• Import from URL:</span>
                        <br />
                        <code className="block ml-4 mt-1">
                          SELECT * FROM read_csv('https://example.com/data.csv')
                        </code>
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-foreground">• Filter data:</span>
                        <br />
                        <code className="block ml-4 mt-1">
                          SELECT * FROM read_json('data.json') WHERE age &gt; 21
                        </code>
                      </p>
                      <p className="text-muted-foreground">
                        <span className="text-foreground">• Join tables:</span>
                        <br />
                        <code className="block ml-4 mt-1">
                          SELECT a.*, b.name FROM table1 a JOIN table2 b ON a.id = b.id
                        </code>
                      </p>
                    </div>
                  </div>

                  {errors.length > 0 && (
                    <div className="space-y-2">
                      {errors.map((error) => {
                        const suggestion = getErrorSuggestion(error.message);
                        return (
                          <Alert key={error.id} variant="destructive">
                            <AlertTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              Error
                            </AlertTitle>
                            <AlertDescription>
                              <div className="space-y-2">
                                <p>{error.message}</p>
                                {suggestion && (
                                  <p className="text-sm opacity-90 border-t pt-2 mt-2">
                                    <strong>Suggestion:</strong> {suggestion}
                                  </p>
                                )}
                              </div>
                            </AlertDescription>
                          </Alert>
                        );
                      })}
                    </div>
                  )}

                  <Button
                    onClick={handleQueryImport}
                    disabled={isQueryImporting}
                    className="w-full"
                  >
                    {isQueryImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing Query...
                      </>
                    ) : (
                      <>
                        <Code className="w-4 h-4 mr-2" />
                        Execute and Import
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default FileImporter;
