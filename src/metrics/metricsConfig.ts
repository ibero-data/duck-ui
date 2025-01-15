import { ReactNode } from "react";

export interface Metrics {
  title: string;
  description: string;
  items?: MetricItem[];
}

export interface MetricItem {
  title: string;
  query: string;
  type: "card" | "table" | "chart";
  chartType?: "bar" | "line" | "area" | "pie" | "radar" | "radial";
  description: string;
  chartConfig?: CustomChartConfig;
  tiles?: number;
}

export type ChartTheme = {
  light: string;
  dark: string;
};

export type ChartDataConfig = {
  label?: ReactNode;
} & ({ color?: string; theme?: never } | { color?: never; theme: ChartTheme });

export type CustomChartConfig = {
  indexBy: string;
  [key: string]: ChartDataConfig | string | undefined;
};

export const metrics: Metrics[] = [
  {
    title: "Metrics",
    description: "Some metrics...",
    items: [
      {
        title: "Server Uptime",
        query: `
          -- set max decimal places to 2
  
          SELECT 
              CONCAT(
                  CAST(ROUND(uptime() / 86400) AS String), ' d, ',
                  CAST(ROUND((uptime() % 86400) / 3600) AS String), ' h, ',
                  CAST(ROUND((uptime() % 3600) / 60) AS String), ' m'
              ) AS uptime_formatted 
          `,
        type: "card",
        description:
          "Total time the server has been running in seconds, minutes, hours, and days.",
        tiles: 1,
      },
      {
        title: "Total Databases",
        query: `
            SELECT COUNT(*) AS total_databases 
            FROM system.databases 
            WHERE name NOT IN ('system', 'information_schema')
          `,
        type: "card",
        description: "Total number of databases excluding system databases.",
        tiles: 1,
      },
      {
        title: "Total Tables",
        query: `
            SELECT COUNT(*) AS total_tables 
            FROM system.tables 
            WHERE database NOT IN ('system', 'information_schema') 
              AND is_temporary = 0 
              AND engine LIKE '%MergeTree%'
          `,
        type: "card",
        description: "Total number of user tables excluding temporary tables.",
        tiles: 1,
      },
      {
        title: "Version",
        query: `SELECT version() AS version`,
        type: "card",
        description:
          "Version of the ClickHouse server running on the current instance.",
        tiles: 1,
      },
      {
        title: "Running Queries",
        query: `SELECT * FROM system.processes WHERE is_cancelled = 0`,
        type: "table",
        description: "Currently running queries excluding system queries.",
        tiles: 4,
      },
      {
        title: "Daily Query Count",
        description: "Number of queries per day for the last 30 days.",
        type: "chart",
        chartType: "bar",
        query: `
            SELECT count() AS query_count, toStartOfDay(event_time) AS day 
            FROM system.query_log 
            WHERE event_time > now() - INTERVAL 30 DAY 
            GROUP BY day 
            ORDER BY day
          `,
        chartConfig: {
          indexBy: "day",
          query_count: {
            label: "Query Count",
            color: "hsl(var(--chart-1))",
          },
        },
        tiles: 4,
      },
    ],
  },
];
