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

interface ConnectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ConnectionFormValues) => Promise<void>; // Change to Promise<void>
  initialValues?: ConnectionFormValues;
  isEditMode?: boolean; // Add isEditMode prop
}

const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  open,
  onOpenChange,
  onSubmit,
  initialValues,
  isEditMode = false, // Default value for isEditMode
}) => {
  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: initialValues || {
      name: "",
      scope: "External" as const,
      host: "",
      port: "",
      database: "",
      user: "",
      password: "",
      authMode: "none" as const,
      apiKey: "",
    },
    mode: "onChange",
  });

  const { isLoadingExternalConnection } = useDuckStore();

  const handleSubmit = async (values: ConnectionFormValues) => {
    await onSubmit(values);
    form.reset();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEditMode ? "Edit Connection" : "Add New Connection"}
          </SheetTitle>
          <SheetDescription>
            {isEditMode
              ? "Modify existing connection details."
              : "Create a new database connection."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
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
                        <SelectItem value="OPFS">OPFS</SelectItem>
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
              {form.watch("scope") === "OPFS" && (
                <>
                  <FormField
                    control={form.control}
                    name="path"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Path</FormLabel>
                        <FormControl>
                          <Input placeholder="my_database.db" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <SheetFooter className="mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoadingExternalConnection}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoadingExternalConnection}>
                  {isEditMode ? "Update Connection" : "Create Connection"}
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
