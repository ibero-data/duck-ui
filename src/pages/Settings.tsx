import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDuckStore } from "@/store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

const settingsSchema = z.object({
  enableHttpMetadataCache: z.boolean(),
  enableObjectCache: z.boolean(),
  maxMemory: z.number().min(1).max(64),
  nullOrder: z.enum(["nulls_first", "nulls_last"]),
  enableProgress: z.boolean(),
  enableQueryLog: z.boolean(),
  maximumExpression: z.number().min(1000).max(1000000),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const defaultValues: SettingsFormValues = {
  enableHttpMetadataCache: false,
  enableObjectCache: false,
  maxMemory: 4,
  nullOrder: "nulls_first",
  enableProgress: true,
  enableQueryLog: true,
  maximumExpression: 250000,
};

const Settings: React.FC = () => {
  const { connection, isInitialized } = useDuckStore();
  const [configStatus, setConfigStatus] = useState<
    "loading" | "error" | "success" | "idle"
  >("idle");

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  const onSubmit = async (values: SettingsFormValues) => {
    if (!isInitialized || !connection) {
      toast.error("DuckDB connection not initialized");
      return;
    }

    setConfigStatus("loading");
    try {
      await Promise.all([
        connection.query(
          `SET enable_http_metadata_cache=${values.enableHttpMetadataCache}`
        ),
        connection.query(`SET enable_object_cache=${values.enableObjectCache}`),
        connection.query(`SET memory_limit='${values.maxMemory}GB'`),
        connection.query(`SET null_order='${values.nullOrder}'`),
        connection.query(`SET enable_progress_bar=${values.enableProgress}`),
        connection.query(`SET enable_http_logging=${values.enableQueryLog}`),
        connection.query(
          `SET max_expression_depth=${values.maximumExpression}`
        ),
      ]);

      setConfigStatus("success");
      toast.success("Settings updated successfully");
    } catch (e: any) {
      setConfigStatus("error");
      toast.error(`Failed to update settings: ${e.message}`);
    }
  };

  const getSetting = async (settingName: string, defaultValue: any) => {
    try {
      const result = await connection?.query(
        `SELECT current_setting('${settingName}') as value`
      );
      const value = result?.toArray()?.[0]?.value;
      return value !== undefined ? value : defaultValue;
    } catch (e) {
      console.warn(`Failed to fetch setting ${settingName}:`, e);
      return defaultValue;
    }
  };

  const fetchCurrentConfig = async () => {
    if (!connection || !isInitialized) return;

    setConfigStatus("loading");
    try {
      const [
        httpMetadataCache,
        objectCache,
        memoryLimit,
        nullOrder,
        progressBar,
        httpLogging,
        expressionDepth,
      ] = await Promise.all([
        getSetting("enable_http_metadata_cache", false),
        getSetting("enable_object_cache", false),
        getSetting("memory_limit", "4GB"),
        getSetting("null_order", "nulls_first"),
        getSetting("enable_progress_bar", true),
        getSetting("enable_http_logging", true),
        getSetting("max_expression_depth", "250000"),
      ]);

      const config = {
        enableHttpMetadataCache: httpMetadataCache === "true",
        enableObjectCache: objectCache === "true",
        maxMemory: parseInt(memoryLimit.replace("GB", "")) || 4,
        nullOrder: nullOrder as "nulls_first" | "nulls_last",
        enableProgress: progressBar === "true",
        enableQueryLog: httpLogging === "true",
        maximumExpression: parseInt(expressionDepth) || 250000,
      };

      form.reset(config);
      setConfigStatus("success");
    } catch (e: any) {
      console.error("Failed to fetch DuckDB configuration:", e);
      setConfigStatus("error");
      toast.error("Failed to load current settings");
    }
  };

  useEffect(() => {
    fetchCurrentConfig();
  }, [connection, isInitialized]);

  return (
    <ScrollArea className="h-full w-full p-4">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings2 className="h-5 w-5" />
              <CardTitle>DuckDB Settings</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCurrentConfig}
              disabled={configStatus === "loading"}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  configStatus === "loading" ? "animate-spin" : ""
                }`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configStatus === "error" && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Configuration Error</AlertTitle>
              <AlertDescription>
                Failed to load or update DuckDB configuration. Please try again.
              </AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-6">
                {/* Performance Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium">Performance Settings</h3>
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="maxMemory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Memory (GB)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(Number(e.target.value))
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maximumExpression"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum Expression Depth</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(Number(e.target.value))
                              }
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Cache Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium">Cache Settings</h3>
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="enableHttpMetadataCache"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div>
                            <FormLabel>HTTP Metadata Cache</FormLabel>
                            <FormDescription>
                              Enable HTTP metadata caching
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="enableObjectCache"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div>
                            <FormLabel>Object Cache</FormLabel>
                            <FormDescription>
                              Enable object caching
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Query Settings */}
                <div className="space-y-4">
                  <h3 className="font-medium">Query Settings</h3>
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="nullOrder"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Null Order</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nulls_first">
                                Nulls First
                              </SelectItem>
                              <SelectItem value="nulls_last">
                                Nulls Last
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="enableProgress"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div>
                            <FormLabel>Progress Bar</FormLabel>
                            <FormDescription>
                              Show query progress
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="enableQueryLog"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div>
                            <FormLabel>Query Logging</FormLabel>
                            <FormDescription>
                              Enable query logging
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={configStatus === "loading"}
              >
                {configStatus === "loading" ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </ScrollArea>
  );
};

export default Settings;
