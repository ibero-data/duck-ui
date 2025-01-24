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
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDuckStore } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

const settingsSchema = z.object({
  maxMemory: z
    .number()
    .min(0.2, "Memory must be at least 0.2 GB")
    .max(9.3, "Memory cannot exceed 9.3 GB"),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const Settings: React.FC = () => {
  const {
    connection,
    isInitialized,
    duckDbConfig,
    isConfiguring,
    error,
    duckDbConfigState,
  } = useDuckStore();
  
  const [isFetching, setIsFetching] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      maxMemory: duckDbConfigState?.max_memory ?? 3.1,
    },
  });

  const onSubmit = async (values: SettingsFormValues) => {
    if (!isInitialized || !connection) {
      toast.error("DuckDB connection not initialized");
      return;
    }

    try {
      await duckDbConfig({ max_memory: values.maxMemory });
      toast.success("Settings updated successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to update settings: ${message}`);
      form.setError("maxMemory", { message });
    }
  };

  const fetchCurrentConfig = async () => {
    if (!connection || !isInitialized) return;

    try {
      setIsFetching(true);
      const result = await connection.query(
        "SELECT current_setting('memory_limit') as value"
      );
      const memoryValue = result.toArray()[0].value;
      toast.info(`Current memory limit: ${memoryValue}`);
      const maxMemory = parseFloat(memoryValue.replace("GB", ""));
      toast.info(`maxMemory: ${maxMemory}`);
      
      if (!isNaN(maxMemory)) {
        form.reset({ maxMemory });
      }
    } catch (error) {
      console.error("Failed to fetch DuckDB configuration:", error);
      toast.error("Failed to load current settings");
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchCurrentConfig();
  }, [connection, isInitialized]);

  // Update form when config changes in store
  useEffect(() => {
    if (duckDbConfigState?.max_memory) {
      form.reset({ maxMemory: duckDbConfigState.max_memory });
    }
  }, [duckDbConfigState]);

  const isLoading = isConfiguring || isFetching;

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
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Configuration Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-6">
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
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                              disabled={isLoading}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isConfiguring ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </ScrollArea>
  );
};

export default Settings;