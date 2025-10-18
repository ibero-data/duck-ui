# Professional Chart System - Feature Documentation

## Overview

Duck-UI now features a **professional-grade charting system** with capabilities comparable to Tableau, Power BI, and Metabase. The system provides advanced visualization, customization, export, and analytical features.

---

## 🎨 Chart Types

### Basic Charts
- **Bar Chart** - Standard vertical bars
- **Grouped Bar** - Side-by-side comparison
- **Stacked Bar** - Cumulative visualization
- **Line Chart** - Trends and time series
- **Area Chart** - Filled line charts
- **Stacked Area** - Cumulative area visualization
- **Pie Chart** - Part-to-whole relationships
- **Donut Chart** - Pie chart with center hole

### Advanced Charts
- **Scatter Plot** - Correlation analysis
- **Combo Charts** - Mix bars + lines (coming soon)
- **Heatmap** - Matrix visualization (coming soon)
- **Treemap** - Hierarchical data (coming soon)
- **Funnel Chart** - Conversion tracking (coming soon)
- **Gauge** - KPI dashboards (coming soon)
- **Box Plot** - Statistical distribution (coming soon)
- **Bubble Chart** - 3-dimensional data (coming soon)

---

## ✨ Key Features

### 1. Multi-Series Support
- Plot multiple Y-axis columns simultaneously
- Different colors per series
- Series grouping by categorical column
- Dual Y-axis for different scales (coming soon)

### 2. Data Transformations
- **Aggregations**: SUM, AVG, COUNT, MIN, MAX
- **Grouping**: By time (day/week/month) or categories
- **Filtering**: Include/exclude data points
- **Sorting**: Ascending/descending
- **Top N**: Show top/bottom N items
- **Smart Suggestions**: AI-powered chart type recommendations

### 3. Visual Customization
- **Color Palettes**: 10+ built-in colors, custom palettes
- **Axes**: Scale (linear/log), range, labels, rotation
- **Legend**: Position (top/bottom/left/right), style, filtering
- **Labels**: Show/hide values, formatting
- **Grid**: Toggle grid lines
- **Animations**: Enable/disable, smooth transitions

### 4. Export & Sharing
- **Export as PNG** - High-resolution (2x scale)
- **Export as SVG** - Vector format for editing
- **Copy to Clipboard** - Quick sharing
- **Print** - Direct print support
- **Share URL** - Generate shareable links (coming soon)

### 5. Chart Templates (15+ Presets)

#### Business Templates
- 📈 **Revenue Trend** - Track revenue over time
- 📊 **Sales Comparison** - Compare sales across categories
- 🥧 **Market Share** - Distribution visualization

#### Analytics Templates
- 🔁 **Conversion Funnel** - Track conversion rates
- 👥 **User Engagement** - Analyze engagement metrics
- 🔗 **Correlation Analysis** - Explore relationships

#### Time Series Templates
- 📉 **Trend Analysis** - Identify patterns
- 📅 **Seasonality Pattern** - Seasonal insights
- 📈 **Growth Rate** - Track percentage growth

#### Comparison Templates
- ⚖️ **Before vs After** - Event impact analysis
- 🎯 **Benchmark Comparison** - Actual vs targets
- 🏆 **Top Performers** - Highlight top N items

#### Distribution Templates
- 📊 **Distribution Analysis** - Data distribution
- 🔥 **Heatmap Matrix** - Pattern visualization
- 🏗️ **Hierarchical View** - Tree structures

### 6. Interactive Features
- **Responsive Design**: Adapts to screen size
- **Dark Mode Support**: Full theme integration
- **Hover Tooltips**: Rich, formatted data on hover
- **Smart Defaults**: Auto-select appropriate columns
- **Type Detection**: Automatically identify numeric/categorical/date columns

---

## 🚀 Usage Guide

### Basic Usage

1. **Run a SQL Query** - Execute any query in the SQL editor
2. **Switch to Charts Tab** - Click "Charts" tab in results panel
3. **Configure Chart**:
   - Select Chart Type (bar, line, pie, etc.)
   - Choose X-Axis column
   - Choose Y-Axis column (numeric)
   - Click "Apply"

### Advanced Usage

#### Multi-Series Charts
1. Select chart type that supports multiple series (grouped bar, stacked bar, etc.)
2. Add multiple Y-axis columns
3. Customize colors for each series

#### Using Templates
1. Click the sparkle icon (✨) in chart toolbar
2. Browse templates by category
3. Click a template to apply preset configuration
4. Customize as needed

#### Customization
1. Click settings icon (⚙️) in chart toolbar
2. Toggle grid lines, values, animations
3. Adjust legend position
4. Configure axis labels and scales

#### Export
1. Click download icon (⬇️) in chart toolbar
2. Choose format (PNG or SVG)
3. Save to your computer

---

## 🛠️ Technical Architecture

### Core Components

**`ChartVisualizationPro.tsx`** - Main chart component
- Handles chart rendering
- Configuration management
- Export functionality
- Template system

**`chartDataTransform.ts`** - Data utilities
- Aggregation functions
- Grouping and sorting
- Type detection
- Smart suggestions

**`chartExport.ts`** - Export utilities
- PNG export via html2canvas
- SVG export
- Clipboard integration
- Print functionality

**`chartTemplates.ts`** - Template library
- 15+ pre-configured templates
- Category-based organization
- Smart recommendations

**`chartUtils.ts`** - Utility functions
- Number formatting
- Label truncation
- Gradient generation

### Type System

```typescript
interface ChartConfig {
  type: ChartType;
  xAxis: string;
  yAxis?: string;
  series?: SeriesConfig[];
  transform?: DataTransform;
  colors?: string[];
  legend?: LegendConfig;
  // ... more options
}
```

---

## 📊 Best Practices

### Choosing Chart Types

- **Time Series Data** → Line or Area charts
- **Comparisons** → Bar or Grouped Bar charts
- **Part-to-Whole** → Pie or Donut charts
- **Correlations** → Scatter plots
- **Distributions** → Histograms or Box plots
- **Hierarchies** → Treemaps or Sunbursts

### Performance Tips

- Limit data to reasonable sizes (< 10,000 rows for interactive charts)
- Use aggregations for large datasets
- Apply Top N filters to focus on key items
- Disable animations for very large datasets

### Design Tips

- Use color strategically (don't overuse)
- Keep legends concise
- Label axes clearly
- Use consistent color schemes
- Consider colorblind-friendly palettes

---

## 🔜 Coming Soon

### Phase 2 Features
- Combo charts (mixed bar + line)
- Dual Y-axis support
- Heatmaps and treemaps
- Funnel and gauge charts
- Brush/zoom for time series
- Drill-down capabilities

### Phase 3 Features
- Annotations (text, arrows)
- Reference lines (targets, averages)
- Statistical overlays (trend lines, confidence intervals)
- Dashboard layouts
- Chart interactions (click to filter)
- SQL generation from charts

---

## 🐛 Troubleshooting

### Chart not displaying
- Ensure query returns data
- Check X and Y axes are selected
- Verify Y-axis is numeric

### Export not working
- Check browser permissions
- Try different format (PNG vs SVG)
- Disable ad blockers

### Poor performance
- Reduce data size
- Apply aggregations
- Disable animations
- Use Top N filtering

---

## 📚 Examples

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

### Example 2: Sales by Category
```sql
SELECT
  category,
  SUM(sales) as total_sales,
  SUM(profit) as total_profit
FROM products
GROUP BY category;
```
**Chart**: Grouped bar chart comparing sales and profit per category

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

---

## 🤝 Contributing

Want to add more chart types or features? Check the codebase:
- Add new chart types in `ChartVisualizationPro.tsx`
- Add utilities in `chartDataTransform.ts`
- Add templates in `chartTemplates.ts`

---

**Built with ❤️ for data analysts and business users**
