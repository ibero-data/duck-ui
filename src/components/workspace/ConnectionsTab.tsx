import { useState } from "react";
import { useDuckStore, ConnectionProvider } from "@/store";
import { generateUUID } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import ConnectionManager from "@/components/connection/ConnectionsModal";
import { ConnectionsList } from "@/components/connection/ConnectionsList";
import * as z from "zod";

const scopeEnum = z.enum(["External", "OPFS"]);
const nameSchema = z
  .string()
  .min(2, { message: "Connection name must be at least 2 characters." })
  .max(30, { message: "Connection name must not exceed 30 characters." });

const opfsSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.OPFS),
  path: z.string().min(1, { message: "Path is required." }),
});

const externalSchema = z.object({
  name: nameSchema,
  scope: z.literal(scopeEnum.enum.External),
  host: z.string().url({ message: "Host must be a valid URL." }),
  port: z
    .string()
    .refine((val) => !isNaN(parseInt(val, 10)) || val === "", {
      message: "Port must be a number.",
    })
    .optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  authMode: z.enum(["none", "password", "api_key"]).optional(),
  apiKey: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const connectionSchema = z.discriminatedUnion("scope", [opfsSchema, externalSchema]);

type ConnectionFormValues = z.infer<typeof connectionSchema>;

const ConnectionsTab = () => {
  const connectionList = useDuckStore((s) => s.connectionList);
  const addConnection = useDuckStore((s) => s.addConnection);
  const updateConnection = useDuckStore((s) => s.updateConnection);
  const deleteConnection = useDuckStore((s) => s.deleteConnection);
  const getConnection = useDuckStore((s) => s.getConnection);
  const setCurrentConnection = useDuckStore((s) => s.setCurrentConnection);
  const currentConnection = useDuckStore((s) => s.currentConnection);
  const isLoadingExternalConnection = useDuckStore((s) => s.isLoadingExternalConnection);
  const isLoading = useDuckStore((s) => s.isLoading);

  const [isEditing, setIsEditing] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [isAddConnectionDialogOpen, setIsAddConnectionDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionFormValues | undefined>(
    undefined
  );

  const handleAddConnection = async (values: ConnectionFormValues) => {
    const connectionData: ConnectionProvider = {
      ...values,
      id: generateUUID(),
      port: values.scope === "External" && values.port ? parseInt(values.port, 10) : undefined,
      environment: "APP",
    };
    await addConnection(connectionData);
  };

  const handleUpdateConnection = async (values: ConnectionFormValues): Promise<void> => {
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
    <div className="p-4 space-y-6 overflow-auto h-full">
      {/* Add Connection Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setIsAddConnectionDialogOpen(true)}
          className="flex items-center gap-2"
          variant="outline"
          disabled={isLoadingExternalConnection}
        >
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      <ConnectionManager
        open={isAddConnectionDialogOpen}
        onOpenChange={setIsAddConnectionDialogOpen}
        onSubmit={handleAddConnection}
        isEditMode={false}
      />

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
        isEditMode={true}
      />

      <Card>
        <CardHeader>
          <CardTitle>Available Connections</CardTitle>
          <CardDescription>List of all configured database connections</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsList
            connections={connectionList.connections}
            currentConnectionId={currentConnection?.id}
            isLoading={isLoading}
            onConnect={handleConnect}
            onEdit={onEdit}
            onDelete={deleteConnection}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectionsTab;
