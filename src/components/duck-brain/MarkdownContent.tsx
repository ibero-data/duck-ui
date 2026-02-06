import React from "react";
import ReactMarkdown, { Components } from "react-markdown";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  skipCodeBlocks?: boolean;
  className?: string;
}

/**
 * Renders markdown content with custom styling.
 * When skipCodeBlocks is true, removes ```sql...``` blocks since they're handled separately.
 */
const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  skipCodeBlocks = false,
  className,
}) => {
  // Remove ALL code blocks if they're handled separately by DuckBrainCodeBlock
  // Uses two passes to catch all variations:
  // 1. Fenced blocks with language identifier and newline: ```sql\n...\n```
  // 2. Fallback for any remaining code blocks: ```...```
  const processedContent = skipCodeBlocks
    ? content
        .replace(/```\w*\n[\s\S]*?```/g, "") // Code blocks with newline after lang
        .replace(/```[\s\S]*?```/g, "") // Any remaining code blocks
        .replace(/\n{3,}/g, "\n\n") // Collapse multiple blank lines
        .trim()
    : content;

  // If nothing left after removing code blocks, don't render
  if (!processedContent) {
    return null;
  }

  const components: Components = {
    // Inline code styling
    code: ({ className: codeClassName, children, ...props }) => {
      // Check if this is a code block (has language class) vs inline code
      const isCodeBlock = codeClassName?.includes("language-");

      if (isCodeBlock) {
        return (
          <pre className="bg-muted p-3 rounded-md overflow-x-auto my-2">
            <code className={cn("text-sm font-mono", codeClassName)} {...props}>
              {children}
            </code>
          </pre>
        );
      }

      // Inline code
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    },
    // Paragraph styling
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    // Strong/bold
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    // Emphasis/italic
    em: ({ children }) => <em className="italic">{children}</em>,
    // Unordered list
    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
    // Ordered list
    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
    // List item
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    // Links
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:no-underline"
      >
        {children}
      </a>
    ),
    // Blockquote
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic my-2">
        {children}
      </blockquote>
    ),
    // Headings (rarely used in chat but good to have)
    h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-2">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
    // Horizontal rule
    hr: () => <hr className="my-3 border-muted-foreground/20" />,
  };

  return (
    <div className={cn("text-sm prose-sm max-w-none", className)}>
      <ReactMarkdown components={components}>{processedContent}</ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;
