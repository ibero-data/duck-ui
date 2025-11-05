// file: add-headers.ts
// description: Script to add file header templates to all source files
// reference: https://bun.sh/docs/api/file-io

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// File descriptions based on directory and file patterns
const descriptionMap: Record<string, string> = {
  'src/main.tsx': 'Main application entry point',
  'src/store/index.ts': 'Global application state store',
  'src/lib/utils.ts': 'Utility functions for the application',
  'src/lib/chartUtils.ts': 'Chart utility functions and helpers',
  'src/lib/chartExport.ts': 'Chart export functionality',
  'src/lib/chartDataTransform.ts': 'Chart data transformation utilities',
  'src/hooks/use-toast.ts': 'Toast notification custom hook',
  'src/pages/Home.tsx': 'Home page component',
  'src/pages/NotFound.tsx': '404 Not Found page component',
  'src/pages/Connections.tsx': 'Connections management page component',
  'src/bun-env.d.ts': 'TypeScript environment declarations for Bun runtime',
};

function getFileDescription(filePath: string): string {
  const relativePath = relative(process.cwd(), filePath);

  // Check exact match first
  if (descriptionMap[relativePath]) {
    return descriptionMap[relativePath];
  }

  // Pattern-based descriptions
  if (relativePath.includes('/ui/')) return 'UI component';
  if (relativePath.includes('/components/charts/')) return 'Chart visualization component';
  if (relativePath.includes('/components/common/')) return 'Common reusable component';
  if (relativePath.includes('/components/connection/')) return 'Connection management component';
  if (relativePath.includes('/components/editor/')) return 'SQL editor component';
  if (relativePath.includes('/components/explorer/')) return 'Data explorer component';
  if (relativePath.includes('/components/layout/')) return 'Layout component';
  if (relativePath.includes('/components/table/')) return 'Table component';
  if (relativePath.includes('/components/theme/')) return 'Theme management component';
  if (relativePath.includes('/components/workspace/')) return 'Workspace component';

  return 'Application component';
}

function getFileReference(filePath: string): string {
  const relativePath = relative(process.cwd(), filePath);

  // Component references
  if (relativePath.includes('/ui/')) return 'https://ui.shadcn.com';
  if (relativePath.includes('/components/charts/')) return 'https://echarts.apache.org';
  if (relativePath.includes('/components/table/')) return 'https://tanstack.com/table';
  if (relativePath.includes('/components/editor/')) return 'https://microsoft.github.io/monaco-editor';
  if (relativePath.includes('/store/')) return 'https://zustand-demo.pmnd.rs';

  return 'https://github.com/ibero-data/duck-ui';
}

function addHeaderToFile(filePath: string) {
  const relativePath = relative(process.cwd(), filePath);
  const content = readFileSync(filePath, 'utf-8');

  // Check if file already has a header (starts with //)
  if (content.trim().startsWith('//')) {
    console.log(`⏭️  Skipping ${relativePath} (already has header)`);
    return;
  }

  const description = getFileDescription(filePath);
  const reference = getFileReference(filePath);

  const header = `// file: ${relativePath}
// description: ${description}
// reference: ${reference}

`;

  const newContent = header + content;
  writeFileSync(filePath, newContent, 'utf-8');
  console.log(`✅ Added header to ${relativePath}`);
}

function walkDirectory(dir: string) {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      walkDirectory(filePath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      addHeaderToFile(filePath);
    }
  }
}

console.log('🦆 Adding file headers to all source files...\n');

// Process src directory
walkDirectory('./src');

// Process root build files
const rootFiles = ['build.ts', 'dev-server.ts', 'preview-server.ts', 'add-headers.ts'];
for (const file of rootFiles) {
  const filePath = join(process.cwd(), file);
  try {
    if (statSync(filePath).isFile()) {
      // Skip this file to avoid recursive header addition
      if (file !== 'add-headers.ts') {
        // These files already have headers
        console.log(`⏭️  Skipping ${file} (build configuration)`);
      }
    }
  } catch (e) {
    // File doesn't exist, skip
  }
}

console.log('\n✅ File header addition complete!');
