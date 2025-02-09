import { useState, useEffect } from "react"; // Import useEffect
import { useDuckStore, ConnectionProvider } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Edit2, Trash2, Database, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { ConnectionDisclaimer } from "@/components/connection/Disclaimer";

const connectionSchema = z.object({
  name: z
    .string()
    .min(2, {
      message: "Connection name must be at least 2 characters.",
    })
    .max(30, {
      message: "Connection name must not exceed 30 characters.",
    }),
  scope: z.enum(["External"]),
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

type ConnectionFormValues = z.infer<typeof connectionSchema>;

interface ConnectionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void; // Use onOpenChange for Dialog
  onSubmit: (values: ConnectionFormValues) => void;
  initialValues?: ConnectionFormValues;
}

const ConnectionForm: React.FC<ConnectionFormProps> = ({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
}) => {
  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: initialValues || {
      name: "",
      scope: "External",
      host: "",
      port: "",
      database: "",
      user: "",
      password: "",
      authMode: "none",
      apiKey: "",
    },
    mode: "onChange",
  });

  const { isLoadingExternalConnection } = useDuckStore(); // Get loading state

  const handleSubmit = async (values: ConnectionFormValues) => { // Make handleSubmit async
    await onSubmit(values); // Await the submission
    form.reset(); // Reset the form after submission
    onOpenChange(false); // Close the dialog
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Connection</DialogTitle>
          <DialogDescription>
            Create a new database connection.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[500px]">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4 p-2"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Database Connection" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection Scope</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Scope" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="External">External</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("scope") === "External" && (
                <>
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host</FormLabel>
                        <FormControl>
                          <Input placeholder="localhost" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Port</FormLabel>
                        <FormControl>
                          <Input placeholder="8123" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="database"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database</FormLabel>
                        <FormControl>
                          <Input placeholder="my_database" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="authMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Authentication Mode</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select auth mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="password">Password</SelectItem>
                            <SelectItem value="api_key">API Key</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("authMode") === "password" && (
                    <>
                      <FormField
                        control={form.control}
                        name="user"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="database_user" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="••••••••"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  {form.watch("authMode") === "api_key" && (
                    <FormField
                      control={form.control}
                      name="apiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Key</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your API key"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoadingExternalConnection} // Disable during loading
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoadingExternalConnection}>
                  Create Connection
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

const Connections = () => {
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

  const handleAddConnection = async (values: ConnectionFormValues) => { // Make async
    const connectionData: ConnectionProvider = {
      ...values,
      id: crypto.randomUUID(),
      port: values.port ? parseInt(values.port, 10) : undefined,
    };
    await addConnection(connectionData); // Await addConnection
  };

  const handleUpdateConnection = (values: ConnectionFormValues) => {
    if (!editingConnectionId) return;

    const connectionData: ConnectionProvider = {
      ...values,
      id: editingConnectionId,
      port: values.port ? parseInt(values.port, 10) : undefined,
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
      setEditingConnection({
        ...connection,
        scope: "External",
        host: connection.host || "",
        port: connection.port?.toString() || "",
      });
      setIsEditing(true);
    }
  };

  const onCancelEdit = () => {
    setIsEditing(false);
    setEditingConnectionId(null);
    setEditingConnection(undefined);
  };

  // Add a useEffect to close the dialog when adding the connection is finish
  useEffect(() => {
    if (!isLoadingExternalConnection && isAddConnectionDialogOpen) {
      setIsAddConnectionDialogOpen(false);
    }
  }, [isLoadingExternalConnection]);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Connections </h1>
        <Button
          onClick={() => setIsAddConnectionDialogOpen(true)}
          className="flex items-center gap-2"
          variant="outline"
          disabled={isLoadingExternalConnection} // Disable during loading
        >
          <Plus />
          Add Connection
        </Button>
        <ConnectionForm
          open={isAddConnectionDialogOpen}
          onOpenChange={setIsAddConnectionDialogOpen}
          onSubmit={handleAddConnection}
        />
      </div>
      <ConnectionDisclaimer />

      {isEditing && editingConnection ? (
        <Card className="w-full max-w-2xl mx-auto mb-8">
          <CardHeader>
            <CardTitle>Edit Connection</CardTitle>
            <CardDescription>
              Modify existing connection details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionForm
              open={isEditing}
              onOpenChange={setIsEditing}
              onSubmit={handleUpdateConnection}
              initialValues={editingConnection}
            />
          </CardContent>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onCancelEdit}>
              Cancel
            </Button>
          </DialogFooter>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Available Connections</CardTitle>
          <CardDescription>
            List of all configured database connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Database</TableHead>
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
                        (connection.scope === "WASM" ? "memory" : "-")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={connection.id === currentConnection?.id || isLoading}
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
                              disabled={connection.id === "WASM"}
                            >
                              <Trash2 size={16} className="text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete Connection
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the connection "
                                {connection.name}"? This action cannot be
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