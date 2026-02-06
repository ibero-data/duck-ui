import React, { useRef, useEffect } from "react";
import { User, Bot, Table2, Columns } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DuckBrainMessage } from "@/store";
import DuckBrainCodeBlock from "./DuckBrainCodeBlock";
import MarkdownContent from "./MarkdownContent";

// Render @ mentions as styled pills
const renderMentions = (content: string) => {
  // Match @table_name or @table.column patterns
  const mentionRegex = /@([\w.]+)/g;
  const parts: (string | React.ReactNode)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Add the mention as a pill
    const mention = match[1];
    const isColumn = mention.includes(".");
    parts.push(
      <span
        key={`${match.index}-${mention}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-primary/20 text-primary-foreground text-xs font-medium"
      >
        {isColumn ? <Columns className="h-3 w-3" /> : <Table2 className="h-3 w-3" />}
        {mention}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
};

interface DuckBrainMessagesProps {
  messages: DuckBrainMessage[];
  streamingContent: string;
  isGenerating: boolean;
  onExecuteSQL?: (messageId: string, sql: string) => void;
  onInsertSQL?: (sql: string) => void;
  className?: string;
}

const DuckBrainMessages: React.FC<DuckBrainMessagesProps> = ({
  messages,
  streamingContent,
  isGenerating,
  onExecuteSQL,
  onInsertSQL,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (messages.length === 0 && !isGenerating) {
    return (
      <div className={cn("flex-1 flex items-center justify-center p-4", className)}>
        <div className="text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">Hi! I'm Duck Brain</p>
          <p className="text-xs mt-1">Ask me to write SQL queries for your data</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("flex-1", className)} ref={scrollRef}>
      <div className="p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[85%] space-y-2",
                message.role === "user" ? "items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted rounded-bl-sm"
                )}
              >
                {message.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{renderMentions(message.content)}</p>
                ) : (
                  <MarkdownContent content={message.content} skipCodeBlocks={!!message.sql} />
                )}
              </div>

              {/* SQL Code Block for assistant messages with extracted SQL */}
              {message.role === "assistant" && message.sql && (
                <DuckBrainCodeBlock
                  sql={message.sql}
                  messageId={message.id}
                  queryResult={message.queryResult}
                  onExecute={onExecuteSQL}
                  onInsert={onInsertSQL}
                />
              )}

              <span className="text-[10px] text-muted-foreground px-1">
                {formatTime(message.timestamp)}
              </span>
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {/* Streaming response */}
        {isGenerating && streamingContent && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary animate-pulse" />
            </div>
            <div className="max-w-[85%]">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2">
                <p className="text-sm whitespace-pre-wrap">
                  {streamingContent}
                  <span className="inline-block w-1 h-4 bg-primary ml-1 animate-pulse" />
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isGenerating && !streamingContent && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
};

export default DuckBrainMessages;
