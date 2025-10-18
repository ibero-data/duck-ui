# Professional Chart System

Duck-UI features a **professional-grade charting system** that enables powerful data visualization directly in your browser. Create multi-series charts, customize visualizations, and export high-quality images.

## Chart Types

### Basic Charts
- **Bar Chart** - Standard vertical bars for comparing values
- **Grouped Bar** - Side-by-side comparison of multiple series
- **Stacked Bar** - Cumulative visualization showing part-to-whole relationships
- **Line Chart** - Trends and time series data
- **Area Chart** - Filled line charts emphasizing volume
- **Stacked Area** - Cumulative area visualization
- **Pie Chart** - Part-to-whole relationships in a circular format
- **Donut Chart** - Pie chart with center hole for additional context

### Advanced Charts
- **Scatter Plot** - Correlation analysis between two numeric variables

## Key Features

### 1. Multi-Series Support
- **Select 2-3 Y-axis columns simultaneously** - Perfect for comparing multiple metrics
- **Automatic color coding** - Each series gets a distinct color from our professional palette
- **Visual indicators** - Color squares show which columns are selected
- Works with grouped bar, stacked bar, line, and area charts

### 2. Data Transformations
- **Aggregations**: SUM, AVG, COUNT, MIN, MAX
- **Grouping**: By time (day/week/month) or categories
- **Filtering**: Include/exclude data points
- **Sorting**: Ascending/descending
- **Top N**: Show top/bottom N items
- **Smart Suggestions**: AI-powered chart type recommendations

### 3. Visual Customization
- **Color Palettes**: 10+ built-in colors, automatic assignment
- **Axes**: Custom labels, rotation, formatting
- **Legend**: Position control (top/bottom/left/right)
- **Labels**: Show/hide values, number formatting
- **Grid**: Toggle grid lines
- **Animations**: Enable/disable smooth transitions

### 4. Export
- **Export as PNG** - High-resolution (2x scale) images ready for presentations and reports
- Single-click export via download button

### 5. Interactive Features
- **Responsive Design**: Adapts to screen size
- **Dark Mode Support**: Full theme integration
- **Hover Tooltips**: Rich, formatted data on hover with opaque backgrounds for readability
- **Smart Defaults**: Auto-select appropriate columns
- **Type Detection**: Automatically identify numeric/categorical/date columns

## Usage Guide

### Basic Workflow

1. **Run a SQL Query** - Execute any query in the SQL editor
2. **Switch to Charts Tab** - Click the "Charts" tab in the results panel
3. **Configure Your Chart**:
   - Select chart type (bar, line, pie, etc.)
   - Choose X-axis column
   - Select 2-3 Y-axis columns using checkboxes
   - Click "Apply"

### Creating Multi-Series Charts

The multi-select Y-axis feature makes it easy to compare multiple metrics:

1. Select a chart type that supports multiple series:
   - Grouped Bar (side-by-side comparison)
   - Stacked Bar (cumulative view)
   - Line Chart (trends)
   - Stacked Area (cumulative area)

2. Use the Y-axis checkboxes to select 2-3 numeric columns
   - Each selected column gets a unique color
   - Color indicator appears next to the column name
   - Maximum of 3 columns can be selected

3. Click "Apply" to render the chart

### Customization

Click the settings icon (⚙️) to access:
- **Show Grid** - Toggle grid lines on/off
- **Show Values** - Display values directly on chart elements
- **Animations** - Enable/disable smooth transitions

### Export

Click the download icon (⬇️) to export your chart as a high-resolution PNG image.

## Technical Architecture

### Core Components

**`ChartVisualizationPro.tsx`** - Main chart component
- Handles chart rendering using Recharts library
- Configuration management
- Export functionality
- Multi-series support

**`chartDataTransform.ts`** - Data utilities
- Aggregation functions
- Grouping and sorting
- Type detection
- Smart suggestions

**`chartExport.ts`** - Export utilities
- PNG export via html2canvas
- High-resolution 2x scaling

**`CustomChartTooltip.tsx`** - Custom tooltip component
- Formatted, opaque tooltips
- Theme-aware styling

**`chartUtils.ts`** - Utility functions
- Number formatting
- Label truncation

### Type System

```typescript
interface ChartConfig {
  type: ChartType;
  xAxis: string;
  yAxis?: string; // Single series (backward compatible)
  series?: SeriesConfig[]; // Multi-series (2-3 columns)
  transform?: DataTransform;
  colors?: string[];
  legend?: LegendConfig;
  showGrid?: boolean;
  showValues?: boolean;
  enableAnimations?: boolean;
}

interface SeriesConfig {
  column: string;
  label?: string;
  color?: string;
  type?: "bar" | "line" | "area";
}
```

## Best Practices

### Choosing Chart Types

- **Time Series Data** → Line or Area charts
- **Comparisons** → Bar or Grouped Bar charts
- **Part-to-Whole** → Pie or Donut charts
- **Correlations** → Scatter plots
- **Multi-Metric Comparison** → Grouped Bar or multi-series Line charts

### Performance Tips

- Limit data to reasonable sizes (< 10,000 rows for interactive charts)
- Use SQL aggregations for large datasets
- Apply LIMIT clauses to focus on key items
- Disable animations for very large datasets

### Design Tips

- Use color strategically (don't overuse)
- Keep legends concise
- Label axes clearly
- Use consistent color schemes across related charts
- Consider accessibility when choosing colors

## Examples

### Example 1: Revenue Trend
```sql
SELECT
  DATE_TRUNC('month', order_date) as month,
  SUM(revenue) as total_revenue
FROM sales
GROUP BY 1
ORDER BY 1;
```
**Chart**: Line chart with month on X-axis, total_revenue on Y-axis

### Example 2: Multi-Metric Comparison
```sql
SELECT
  category,
  SUM(sales) as total_sales,
  SUM(profit) as total_profit,
  SUM(revenue) as total_revenue
FROM products
GROUP BY category;
```
**Chart**: Grouped bar chart comparing 2-3 metrics per category
- Select `category` for X-axis
- Check 2-3 columns from: `total_sales`, `total_profit`, `total_revenue`

### Example 3: Market Share
```sql
SELECT
  product_name,
  revenue
FROM product_summary
ORDER BY revenue DESC
LIMIT 10;
```
**Chart**: Donut chart showing top 10 products by revenue

## Troubleshooting

### Chart not displaying
- Ensure query returns data
- Check X and Y axes are selected
- Verify Y-axis columns are numeric
- For multi-series charts, select at least 1 Y-axis column

### Export not working
- Check browser permissions for downloads
- Disable ad blockers if necessary
- Ensure chart is fully rendered before exporting

### Poor performance
- Reduce data size using SQL LIMIT
- Apply aggregations in your SQL query
- Disable animations in chart settings
- Use fewer series (2-3 maximum)

### Colors not showing correctly
- Check your theme settings (dark/light mode)
- Ensure numeric columns are selected for Y-axis
- Verify data types are correct

## Future Enhancements

Planned features for future releases:
- Combo charts (mixed bar + line)
- Dual Y-axis support
- Heatmaps and treemaps
- Funnel and gauge charts
- Brush/zoom for time series
- Drill-down capabilities
- Annotations and reference lines
- Statistical overlays
