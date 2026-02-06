// ConnectionManager.tsx
import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useDuckStore } from "@/store";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

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

interface ConnectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ConnectionFormValues) => Promise<void>;
  initialValues?: ConnectionFormValues;
  isEditMode?: boolean;
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isEditMode = false,
}) => {
  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: initialValues || {
      name: "Local DuckDB",
      scope: "External" as const,
      host: "http://localhost:9999",
      port: "",
      database: "",
      user: "",
      password: "",
      authMode: "none" as const,
      apiKey: "",
    },
    mode: "onChange",
  });

  const currentScope = form.watch("scope");
  const { isLoadingExternalConnection } = useDuckStore();

  const handleSubmit = async (values: ConnectionFormValues) => {
    await onSubmit(values);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[450px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditMode ? "Edit Connection" : "Add New Connection"}</SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Modify existing connection details."
              : "Connect to a DuckDB instance or browser storage."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Database" {...field} />
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
                    <FormLabel>Connection Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="External">DuckDB HTTP Server</SelectItem>
                        <SelectItem value="OPFS">Browser Storage (OPFS)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* External Connection Fields */}
              {currentScope === "External" && (
                <>
                  <Alert className="bg-muted/50">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs space-y-1">
                      <p>Start HTTP server in DuckDB:</p>
                      <pre className="bg-background px-2 py-1 rounded text-[10px] leading-relaxed">
                        {`INSTALL httpserver FROM community;
LOAD httpserver;
SELECT httpserve_start('0.0.0.0', 9999, '');`}
                      </pre>
                    </AlertDescription>
                  </Alert>

                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host URL</FormLabel>
                        <FormControl>
                          <Input placeholder="http://localhost:9999" {...field} />
                        </FormControl>
                        <FormDescription>Full URL including protocol (http/https)</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="database"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database (optional)</FormLabel>
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
                        <FormLabel>Authentication</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select auth mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="password">Username/Password</SelectItem>
                            <SelectItem value="api_key">API Key</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("authMode") === "password" && (
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="user"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username</FormLabel>
                            <FormControl>
                              <Input placeholder="user" {...field} />
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
                              <Input type="password" placeholder="********" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  {form.watch("authMode") === "api_key" && (
                    <FormField
                      control={form.control}
                      name="apiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Key</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Enter API key" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {/* OPFS Fields */}
              {currentScope === "OPFS" && (
                <>
                  <Alert className="bg-muted/50">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Data persists in your browser across sessions.
                    </AlertDescription>
                  </Alert>

                  <FormField
                    control={form.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Database File</FormLabel>
                        <FormControl>
                          <Input placeholder="my_data.db" {...field} />
                        </FormControl>
                        <FormDescription>
                          Filename for your database (e.g., data.db)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <SheetFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoadingExternalConnection}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoadingExternalConnection}>
                  {isLoadingExternalConnection
                    ? "Connecting..."
                    : isEditMode
                      ? "Update"
                      : "Connect"}
                </Button>
              </SheetFooter>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ConnectionManager;
