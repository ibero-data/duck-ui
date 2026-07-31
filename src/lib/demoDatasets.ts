import type { ChartConfig } from "@/store/types";

/**
 * Curated public datasets for one-click exploration.
 *
 * Each dataset points at a CORS-enabled remote file that DuckDB-WASM reads
 * directly over httpfs — no upload, no backend. The starter query and chart
 * config are real (column names verified against the live data) so clicking a
 * card lands the user on a populated table + chart in seconds.
 *
 * Because these read from public URLs, analyses built on them produce share
 * links (see `src/lib/share`) that reproduce fully for anyone who opens them.
 */
export interface DemoDataset {
  id: string;
  name: string;
  description: string;
  /** Approximate row count, for display. */
  rows: string;
  /** Source label shown on the card. */
  source: string;
  /** Starter SQL — runs immediately on open. */
  query: string;
  /** Chart config paired with the starter query's result. */
  chartConfig?: ChartConfig;
  /**
   * CSV sources are downloaded in JS and registered into DuckDB's virtual FS
   * under `file` before the query runs. Remote-CSV dialect sniffing over
   * httpfs is unreliable in duckdb-wasm (partial range reads confuse the
   * sniffer), while parsing locally-registered bytes is rock solid — parquet
   * sources don't need this and stream directly.
   */
  stage?: { url: string; file: string };
}

export const demoDatasets: DemoDataset[] = [
  {
    id: "seattle-weather",
    name: "Seattle Weather",
    description: "Four years of daily weather — average high temperature by month.",
    rows: "1.4K rows",
    source: "vega-datasets · CSV",
    stage: {
      url: "https://raw.githubusercontent.com/vega/vega-datasets/main/data/seattle-weather.csv",
      file: "seattle_weather.csv",
    },
    query: `-- Average high temperature by month
SELECT
  month("date") AS month,
  ROUND(AVG(temp_max), 1) AS avg_high_c
FROM read_csv('seattle_weather.csv')
GROUP BY month
ORDER BY month;`,
    chartConfig: { type: "line", xAxis: "month", yAxis: "avg_high_c" },
  },
  {
    id: "train-services",
    name: "Dutch Train Services",
    description: "380K real railway stops — find the busiest stations in the network.",
    rows: "380K rows",
    source: "blobs.duckdb.org · Parquet",
    query: `-- Busiest stations by number of stops
SELECT
  station_name,
  COUNT(*) AS stops
FROM 'https://blobs.duckdb.org/train_services.parquet'
GROUP BY station_name
ORDER BY stops DESC
LIMIT 15;`,
    chartConfig: { type: "bar", xAxis: "station_name", yAxis: "stops" },
  },
  {
    id: "stations",
    name: "Train Stations",
    description: "578 European train stations by country and type.",
    rows: "578 rows",
    source: "blobs.duckdb.org · Parquet",
    query: `-- Stations per country
SELECT
  country,
  COUNT(*) AS stations
FROM 'https://blobs.duckdb.org/stations.parquet'
GROUP BY country
ORDER BY stations DESC;`,
    chartConfig: { type: "bar", xAxis: "country", yAxis: "stations" },
  },
  {
    id: "star-trek",
    name: "Star Trek S1 🖖",
    description: "A fun one — redshirts lost per episode of the original series.",
    rows: "30 rows",
    source: "blobs.duckdb.org · CSV",
    stage: {
      url: "https://blobs.duckdb.org/data/Star_Trek-Season_1.csv",
      file: "star_trek_s1.csv",
    },
    query: `-- Downed redshirts per episode
SELECT
  episode_num,
  cnt_downed_redshirts AS redshirts_lost
FROM read_csv('star_trek_s1.csv')
ORDER BY episode_num;`,
    chartConfig: { type: "bar", xAxis: "episode_num", yAxis: "redshirts_lost" },
  },
];
