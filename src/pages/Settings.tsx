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
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDuckStore } from "@/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const settingsSchema = z.object({
  maxMemory: z
    .number({ invalid_type_error: "Memory must be a number" })
    .min(0.2, "Memory must be at least 0.2")
    .max(100, "Memory cannot exceed 100"),
  memoryUnit: z.enum(["MB", "GB"]),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const Settings: React.FC = () => {
  const { connection, isInitialized, duckDbConfig, error, duckDbConfigState } =
    useDuckStore();

  const [isFetching, setIsFetching] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      maxMemory: duckDbConfigState?.max_memory ?? 3.1,
      memoryUnit: "GB",
    },
  });

  const onSubmit = async (values: SettingsFormValues) => {
    if (!isInitialized || !connection) {
      toast.error("DuckDB connection not initialized");
      return;
    }

    const memoryInGB =
      values.memoryUnit === "MB" ? values.maxMemory / 1024 : values.maxMemory;

    try {
      await duckDbConfig({ max_memory: memoryInGB });
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
      let maxMemory = parseFloat(memoryValue.replace("GB", ""));
      let memoryUnit: "MB" | "GB" = "GB";

      if (memoryValue.includes("MB")) {
        maxMemory = parseFloat(memoryValue.replace("MB", ""));
        memoryUnit = "MB";
      }

      if (!isNaN(maxMemory)) {
        form.reset({
          maxMemory: memoryUnit === "MB" ? maxMemory : maxMemory,
          memoryUnit,
        });
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

  useEffect(() => {
    if (duckDbConfigState?.max_memory) {
      const memoryInMB = duckDbConfigState.max_memory * 1024;
      const memoryUnit = memoryInMB < 1024 ? "MB" : "GB";
      const maxMemory =
        memoryUnit === "MB" ? memoryInMB : duckDbConfigState.max_memory;
      form.reset({ maxMemory, memoryUnit });
    }
  }, [duckDbConfigState, form.reset]);

  const handleMemoryChange = (value: string) => {
    form.setValue("maxMemory", Number(value), { shouldValidate: true });
  };

  return (
    <div className="container max-w-2xl py-6 m-auto">
      <Card className="shadow-none p-6">
        <CardHeader className="px-0">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle>DuckDB Settings</CardTitle>
              </div>
              <CardDescription>
                Configure memory and performance settings for DuckDB
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchCurrentConfig}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-0">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>Configuration Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">Performance Settings</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Adjust memory allocation for optimal performance
                  </p>
                </div>

                <Separator />

                <FormField
                  control={form.control}
                  name="maxMemory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum Memory</FormLabel>
                      <FormDescription>
                        Set the maximum memory DuckDB can use for query
                        processing
                      </FormDescription>
                      <div className="flex items-center gap-3">
                        <FormControl className="flex-1">
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => handleMemoryChange(e.target.value)}
                            disabled={isFetching}
                            className="max-w-[200px]"
                          />
                        </FormControl>
                        <FormField
                          control={form.control}
                          name="memoryUnit"
                          render={({ field }) => (
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              disabled={isFetching}
                            >
                              <FormControl>
                                <SelectTrigger className="w-[100px]">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MB">MB</SelectItem>
                                <SelectItem value="GB">GB</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isFetching}
                  className="min-w-[120px]"
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
