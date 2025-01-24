import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CircleOff,
  Database,
  MemoryStick,
  Settings2,
  Shield,
  RefreshCw,
  Loader2,
  Search,
  Filter,
} from "lucide-react";
import { useDuckStore } from "@/store";
import { Button } from "@/components/ui/button";

interface DuckDBSetting {
  name: string;
  value: string | boolean | number | null;
  description: string;
  input_type: string;
}

const MetricCard: React.FC<{
  title: string;
  description: string;
  value: string | boolean | number | null;
  type: string;
}> = ({ title, description, value, type }) => (
  <Card className="h-full transition-all hover:shadow-md">
    <CardHeader className="space-y-1">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Badge variant={type === 'BOOLEAN' ? 'default' : 'outline'} 
               className="text-xs">
          {type}
        </Badge>
      </div>
      <CardDescription className="text-xs line-clamp-2 hover:line-clamp-none">
        {description}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="text-lg font-bold break-words">
        {value === null ? (
          <span className="text-muted-foreground">NULL</span>
        ) : typeof value === 'boolean' ? (
          <Badge variant={value ? "default" : "destructive"}>
            {value.toString()}
          </Badge>
        ) : (
          value
        )}
      </div>
    </CardContent>
  </Card>
);

const FilterBar: React.FC<{
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  typeFilter: string;
  setTypeFilter: (type: string) => void;
  types: string[];
}> = ({ searchTerm, setSearchTerm, typeFilter, setTypeFilter, types }) => (
  <div className="flex flex-col sm:flex-row gap-4 m-6">
    <div className="relative flex-1">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Search settings..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="pl-8"
      />
    </div>
    <Select value={typeFilter} onValueChange={setTypeFilter}>
      <SelectTrigger className="w-full sm:w-[180px]">
        <Filter className="mr-2 h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Types</SelectItem>
        {types.filter(type => type?.trim()).map((type) => (
          <SelectItem key={type} value={type}>
            {type}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default function Metrics() {
  const { connection, isInitialized } = useDuckStore();
  const [settings, setSettings] = useState<DuckDBSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const fetchMetrics = async () => {
    if (!connection || !isInitialized) return;

    setLoading(true);
    setError(null);
    try {
      const result = await connection.query(`SELECT * FROM duckdb_settings()`);
      const plainData = result.toArray().map((row) => ({
        name: row.name,
        value: row.value,
        description: row.description,
        input_type: row.input_type,
      }));
      setSettings(plainData);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [connection, isInitialized]);

  const categoryMetrics = {
    performance: [
      "memory_limit",
      "threads",
      "worker_threads",
      "max_memory",
      "external_threads",
      "allocator_flush_threshold",
      "streaming_buffer_size",
    ],
    storage: [
      "temp_directory",
      "extension_directory",
      "home_directory",
      "default_block_size",
      "checkpoint_threshold",
      "wal_autocheckpoint",
    ],
    security: [
      "allow_unsigned_extensions",
      "allow_persistent_secrets",
      "allow_extensions_metadata_mismatch",
      "enable_external_access",
      "enable_http_metadata_cache",
    ],
    system: [
      "duckdb_api",
      "storage_compatibility_version",
      "default_order",
      "default_null_order",
      "preserve_identifier_case",
    ],
  };

  const uniqueTypes = Array.from(new Set(settings.map(s => s.input_type))).sort();

  const filteredSettings = settings.filter(setting => {
    const matchesSearch = 
      setting.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      setting.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || setting.input_type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertTitle>Error fetching metrics</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="w-full h-screen p-4 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Metrics</h2>
          <p className="text-sm text-muted-foreground">
            Monitor and analyze your DuckDB settings
          </p>
        </div>
        <Button 
          onClick={fetchMetrics} 
          variant="outline" 
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <MemoryStick className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Storage
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            System
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <CircleOff className="h-4 w-4" />
            All Settings
          </TabsTrigger>
        </TabsList>

        <FilterBar 
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          types={uniqueTypes}
        />

        {Object.entries(categoryMetrics).map(([category, metricNames]) => (
          <TabsContent key={category} value={category} className="m-0">
            <ScrollArea className="h-[calc(100vh-320px)]">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                {filteredSettings
                  .filter((setting) => metricNames.includes(setting.name))
                  .map((setting) => (
                    <MetricCard
                      key={setting.name}
                      title={setting.name}
                      description={setting.description}
                      value={setting.value}
                      type={setting.input_type}
                    />
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}

        <TabsContent value="all" className="m-0">
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
              {filteredSettings.map((setting) => (
                <MetricCard
                  key={setting.name}
                  title={setting.name}
                  description={setting.description}
                  value={setting.value}
                  type={setting.input_type}
                />
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}