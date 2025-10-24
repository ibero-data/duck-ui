import * as React from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  label: string;
  value: string;
  color?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxSelected?: number;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  maxSelected,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      if (maxSelected && selected.length >= maxSelected) {
        return;
      }
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((item) => item !== value));
  };

  const selectedOptions = options.filter((option) =>
    selected.includes(option.value)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between min-h-10 h-auto", className)}
        >
          <div className="flex gap-1 overflow-x-auto flex-1 mr-2 py-1 scrollbar-thin">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="shrink-0 gap-1.5 px-2.5 py-1"
                  style={{
                    backgroundColor: option.color
                      ? `${option.color}20`
                      : undefined,
                    borderColor: option.color || undefined,
                    borderWidth: '1px',
                  }}
                >
                  {option.color && (
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="whitespace-nowrap">{option.label}</span>
                  <X
                    className="h-3.5 w-3.5 cursor-pointer opacity-70 hover:opacity-100 shrink-0"
                    onClick={(e) => handleRemove(option.value, e)}
                  />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-9" />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option.value);
                const isDisabled = Boolean(
                  !isSelected && maxSelected && selected.length >= maxSelected
                );

                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                    disabled={isDisabled}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 flex-1">
                      {option.color && (
                        <div
                          className="w-3 h-3 rounded shrink-0"
                          style={{
                            backgroundColor: option.color,
                            opacity: isSelected ? 1 : 0.5,
                            border: `1px solid ${option.color}`,
                          }}
                        />
                      )}
                      <span className={isDisabled ? "opacity-50" : ""}>
                        {option.label}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="ml-auto h-4 w-4 opacity-100" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
