import { useState } from "react";
import { useNavigate } from "react-router";
import { useDuckStore, ConnectionProvider } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Edit2,
  Trash2,
  Database,
  ExternalLink,
  InfoIcon,
  ArrowLeft,
} from "lucide-react";
import { ConnectionDisclaimer } from "@/components/connection/Disclaimer";
import ConnectionManager from "@/components/connection/ConnectionsModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define ConnectionFormValues type here for use in Connections component
import * as z from "zod";

const scopeEnum = z.enum(["External", "OPFS"]);
const nameSchema = z
  .string()
  .min(2, {
    message: "Connection name must be at least 2 characters.",
  })
  .max(30, {
    message: "Connection name must not exceed 30 characters.",
  });

const opfsSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.OPFS),
  path: z.string().min(1, {
    message: "Path is required.",
  }),
});

const externalSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.External),
  host: z.string().url({
    message: "Host must be a valid URL.",
  }),
  port: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) || val === "", {
      //Allow empty string
      message: "Port must be a number.",
    })
    .optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  authMode: z.enum(["none", "password", "api_key"]).optional(),
  apiKey: z.string().optional(),
});

const connectionSchema = z.discriminatedUnion("scope", [opfsSchema, externalSchema]);

type ConnectionFormValues = z.infer<typeof connectionSchema>;

const Connections = () => {
  const navigate = useNavigate();
  const {
    connectionList,
    addConnection,
    updateConnection,
    deleteConnection,
    getConnection,
    setCurrentConnection,
    currentConnection,
    isLoadingExternalConnection, // Get the loading state
    isLoading,
  } = useDuckStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(
    null
  );
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);
  const [isAddConnectionDialogOpen, setIsAddConnectionDialogOpen] =
    useState(false);
  const [editingConnection, setEditingConnection] = useState<
    ConnectionFormValues | undefined
  >(undefined);

  const handleAddConnection = async (values: ConnectionFormValues) => {
    const connectionData: ConnectionProvider = {
      ...values,
      id: crypto.randomUUID(),
      port: values.scope === "External" && values.port ? parseInt(values.port, 10) : undefined,
      environment: "APP",
    };
    await addConnection(connectionData);
  };

  const handleUpdateConnection = async (
    values: ConnectionFormValues
  ): Promise<void> => {
    if (!editingConnectionId) return;

    const connectionData: ConnectionProvider = {
      ...values,
      id: editingConnectionId,
      port: values.scope === "External" && values.port ? parseInt(values.port, 10) : undefined,
      environment: "APP",
    };
    updateConnection(connectionData);
    setEditingConnectionId(null);
    setIsEditing(false);
  };

  const handleConnect = async (connectionId: string) => {
    try {
      await setCurrentConnection(connectionId);
    } catch (error) {
      console.error("Failed to connect:", error);
    }
  };

  const onEdit = (connectionId: string) => {
    const connection = getConnection(connectionId);
    if (connection) {
      setEditingConnectionId(connectionId);
      const baseConnection = {
        name: connection.name,
        scope: connection.scope as "External" | "OPFS",
      };

      // Add scope-specific fields
      if (connection.scope === "OPFS") {
        setEditingConnection({
          ...baseConnection,
          scope: "OPFS",
          path: connection.path || "",
        });
      } else {
        setEditingConnection({
          ...baseConnection,
          scope: "External",
          host: connection.host || "",
          port: connection.port?.toString() || "",
          database: connection.database,
          user: connection.user,
          password: connection.password,
          authMode: connection.authMode,
          apiKey: connection.apiKey,
        });
      }
      setIsEditing(true);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6 overflow-auto h-full">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Connections</h1>
        </div>
        <Button
          onClick={() => setIsAddConnectionDialogOpen(true)}
          className="flex items-center gap-2"
          variant="outline"
          disabled={isLoadingExternalConnection}
        >
          <Plus />
          Add Connection
        </Button>

        {/* Use ConnectionManager for adding connections */}
        <ConnectionManager
          open={isAddConnectionDialogOpen}
          onOpenChange={setIsAddConnectionDialogOpen}
          onSubmit={handleAddConnection}
          isEditMode={false} // Ensure it's in add mode
        />

        {/* Use ConnectionManager for editing connections */}
        <ConnectionManager
          open={isEditing}
          onOpenChange={(open) => {
            setIsEditing(open);
            if (!open) {
              setEditingConnectionId(null);
              setEditingConnection(undefined);
            }
          }}
          onSubmit={handleUpdateConnection}
          initialValues={editingConnection}
          isEditMode={true} // Set to edit mode
        />
      </div>
      <ConnectionDisclaimer />

      <Card>
        <CardHeader>
          <CardTitle>Available Connections</CardTitle>
          <CardDescription>
            List of all configured database connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-400px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Database</TableHead>
                  <TableHead>Enviorment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectionList.connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell
                      className={
                        connection.id === currentConnection?.id
                          ? "border-l-4 border-green-500"
                          : ""
                      }
                    >
                      <div className="flex items-center gap-2">
                        {connection.scope === "WASM" ? (
                          <Database size={16} />
                        ) : (
                          <ExternalLink size={16} />
                        )}
                        {connection.name}
                      </div>
                    </TableCell>
                    <TableCell>{connection.scope}</TableCell>
                    <TableCell>
                      {connection.host ||
                        (connection.scope === "WASM" ? "Local" : "-")}
                    </TableCell>
                    <TableCell>
                      {connection.database ||
                        (connection.scope === "WASM"
                          ? "memory"
                          : connection.database)}
                    </TableCell>
                    <TableCell>{connection.environment}</TableCell>

                    <TableCell className="text-right">
                      {connection.environment === "BUILT_IN" || connection.environment === "ENV" ? (
                        <div className="justify-end flex gap-2 p-2 rounded-md">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon size={20} />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-sm max-w-[200px] !text-center">
                                  This connection is built-in or was set via
                                  docker environment variables and cannot be
                                  modified or deleted.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              connection.id === currentConnection?.id ||
                              isLoading
                            }
                            onClick={() => handleConnect(connection.id)}
                          >
                            {connection.id === currentConnection?.id
                              ? "Connected"
                              : "Connect"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(connection.id)}
                            disabled={connection.id === "WASM"}
                          >
                            <Edit2 size={16} />
                          </Button>
                          <AlertDialog
                            open={deleteConfirmationId === connection.id}
                            onOpenChange={(isOpen) =>
                              setDeleteConfirmationId(
                                isOpen ? connection.id : null
                              )
                            }
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={isLoading}
                              >
                                <Trash2
                                  size={16}
                                  className="text-destructive"
                                />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete Connection
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete the connection
                                  "{connection.name}"? This action cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    deleteConnection(connection.id);
                                    setDeleteConfirmationId(null);
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default Connections;
