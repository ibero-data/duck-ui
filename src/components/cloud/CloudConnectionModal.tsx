/**
 * Cloud Connection Modal
 * Form for adding/editing S3, GCS, and Azure cloud storage connections
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Cloud, AlertTriangle } from "lucide-react";
import { useDuckStore } from "@/store";
import type { CloudConnection } from "@/store";

interface CloudConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingConnection?: CloudConnection;
}

// Form validation schema
const cloudConnectionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["s3", "gcs", "azure"]),
  // S3 fields
  bucket: z.string().optional(),
  region: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  endpoint: z.string().optional(),
  // GCS fields
  hmacKeyId: z.string().optional(),
  hmacSecret: z.string().optional(),
  // Azure fields
  accountName: z.string().optional(),
  accountKey: z.string().optional(),
  containerName: z.string().optional(),
}).refine((data) => {
  // Validate required fields based on type
  if (data.type === "s3") {
    return data.bucket && data.accessKeyId && data.secretAccessKey;
  }
  if (data.type === "gcs") {
    return data.bucket && data.hmacKeyId && data.hmacSecret;
  }
  if (data.type === "azure") {
    return data.containerName && data.accountName && data.accountKey;
  }
  return true;
}, {
  message: "Please fill in all required fields for the selected provider",
});

type CloudConnectionFormData = z.infer<typeof cloudConnectionSchema>;

export function CloudConnectionModal({
  isOpen,
  onClose,
  existingConnection,
}: CloudConnectionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const { addCloudConnection, cloudSupportStatus } = useDuckStore();

  const form = useForm<CloudConnectionFormData>({
    resolver: zodResolver(cloudConnectionSchema),
    defaultValues: {
      name: existingConnection?.name || "",
      type: existingConnection?.type || "s3",
      bucket: existingConnection?.bucket || "",
      region: existingConnection?.region || "us-east-1",
      accessKeyId: existingConnection?.accessKeyId || "",
      secretAccessKey: existingConnection?.secretAccessKey || "",
      endpoint: existingConnection?.endpoint || "",
      hmacKeyId: existingConnection?.hmacKeyId || "",
      hmacSecret: existingConnection?.hmacSecret || "",
      accountName: existingConnection?.accountName || "",
      accountKey: existingConnection?.accountKey || "",
      containerName: existingConnection?.containerName || "",
    },
  });

  const selectedType = form.watch("type");

  const onSubmit = async (data: CloudConnectionFormData) => {
    setIsSubmitting(true);
    try {
      await addCloudConnection({
        name: data.name,
        type: data.type,
        bucket: data.bucket,
        region: data.region,
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        endpoint: data.endpoint,
        hmacKeyId: data.hmacKeyId,
        hmacSecret: data.hmacSecret,
        accountName: data.accountName,
        accountKey: data.accountKey,
        containerName: data.containerName,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    // For testing, we'd need to add the connection first, test it, then remove if failed
    // For now, show a message about the support status
    setTimeout(() => {
      if (!cloudSupportStatus?.httpfsAvailable) {
        setTestResult({
          success: false,
          error: "Cloud storage (httpfs) is not available in this browser. Direct S3/GCS/Azure access may not work due to CORS restrictions.",
        });
      } else if (!cloudSupportStatus?.secretsSupported) {
        setTestResult({
          success: false,
          error: "DuckDB secrets are not supported. Cloud storage authentication may not work.",
        });
      } else {
        setTestResult({
          success: true,
        });
      }
      setIsTesting(false);
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            {existingConnection ? "Edit" : "Add"} Cloud Connection
          </DialogTitle>
          <DialogDescription>
            Connect to cloud storage (S3, Google Cloud Storage, or Azure Blob Storage)
          </DialogDescription>
        </DialogHeader>

        {/* Support Status Warning */}
        {cloudSupportStatus && !cloudSupportStatus.httpfsAvailable && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Cloud storage support is limited in this browser. The httpfs extension is not available.
              You may need to use HTTPS URLs directly instead of s3:// or gcs:// protocols.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Connection Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Connection Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My S3 Bucket" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Provider Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Provider</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="s3">Amazon S3 / S3-Compatible</SelectItem>
                      <SelectItem value="gcs">Google Cloud Storage</SelectItem>
                      <SelectItem value="azure">Azure Blob Storage</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    S3-compatible includes MinIO, Cloudflare R2, DigitalOcean Spaces
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* S3 Fields */}
            {selectedType === "s3" && (
              <>
                <FormField
                  control={form.control}
                  name="bucket"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bucket Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="my-bucket" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <FormControl>
                        <Input placeholder="us-east-1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accessKeyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Key ID *</FormLabel>
                      <FormControl>
                        <Input placeholder="AKIAIOSFODNN7EXAMPLE" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="secretAccessKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret Access Key *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="wJalrXUtn..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endpoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Endpoint (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://minio.example.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        For S3-compatible services like MinIO or R2
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* GCS Fields */}
            {selectedType === "gcs" && (
              <>
                <FormField
                  control={form.control}
                  name="bucket"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bucket Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="my-gcs-bucket" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hmacKeyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HMAC Key ID *</FormLabel>
                      <FormControl>
                        <Input placeholder="GOOGTS7C7FUP..." {...field} />
                      </FormControl>
                      <FormDescription>
                        Generate HMAC keys in GCP Console under Cloud Storage Settings
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hmacSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>HMAC Secret *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Azure Fields */}
            {selectedType === "azure" && (
              <>
                <FormField
                  control={form.control}
                  name="containerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Container Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="my-container" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Storage Account Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="mystorageaccount" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="accountKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Key *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            {/* Test Result */}
            {testResult && (
              <Alert variant={testResult.success ? "default" : "destructive"}>
                <AlertDescription>
                  {testResult.success
                    ? "Cloud storage support is available!"
                    : testResult.error}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={handleTest} disabled={isTesting}>
                {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Support
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {existingConnection ? "Update" : "Add"} Connection
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
