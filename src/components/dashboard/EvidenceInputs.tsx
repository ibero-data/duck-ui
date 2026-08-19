import { useEffect, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultInputValue, type InputsStore, type InputValue } from "@/services/dashboard/inputs";
import type { ComponentBlock, ComponentPropValue } from "@/services/dashboard/markdown";
import type { DatasetResult } from "@/services/dashboard/queryRunner";

/**
 * Input components — the Grafana-variable layer, in Evidence's syntax.
 *
 *   <Dropdown name=region data={regions} value=region_name title='Region'/>
 *   <DateRange name=period/>
 *   <DatePicker name=day/>
 *
 * Each publishes into the dashboard's `InputsStore`; queries referencing
 * `${inputs.name...}` re-run when it changes. Values are view state: two
 * people reading the same shared report can pick different dates.
 */

interface InputComponentProps {
  block: ComponentBlock;
  inputs: InputsStore;
  values: ReadonlyMap<string, InputValue>;
  results: ReadonlyMap<string, DatasetResult>;
}

const text = (value: ComponentPropValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.kind === "literal") return value.value;
  if (value.kind === "number") return String(value.value);
  if (value.kind === "boolean") return value.value ? "true" : "false";
  return value.name;
};

const number = (value: ComponentPropValue | undefined): number | undefined =>
  value?.kind === "number" ? value.value : undefined;

const Invalid = ({ message }: { message: string }) => (
  <span className="my-2 inline-block rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
    {message}
  </span>
);

export default function InputComponent({ block, inputs, values, results }: InputComponentProps) {
  const name = text(block.props.name);
  const title = text(block.props.title) ?? name;

  /** Options for Dropdown/ButtonGroup: query-backed, or a literal list. */
  const options = useMemo(() => {
    const dataRef = block.props.data;
    const valueColumn = text(block.props.value);
    if (dataRef?.kind === "reference" && valueColumn) {
      const entry = results.get(dataRef.name);
      if (entry?.status !== "ready" || !entry.result) return [];
      const labelColumn = text(block.props.label) ?? valueColumn;
      const seen = new Set<string>();
      const collected: { value: string; label: string }[] = [];
      for (const row of entry.result.data) {
        const value = String(row[valueColumn] ?? "");
        if (seen.has(value)) continue;
        seen.add(value);
        collected.push({ value, label: String(row[labelColumn] ?? value) });
      }
      return collected;
    }
    // Literal list: options='a,b,c'
    const literal = text(block.props.options);
    return (literal ?? "")
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean)
      .map((option) => ({ value: option, label: option }));
  }, [block.props, results]);

  // Register a default so every referencing query can run before interaction.
  // Dropdowns without an explicit default adopt their first option once the
  // options query lands.
  useEffect(() => {
    if (!name) return;
    const explicit = text(block.props.defaultValue);
    if ((block.tag === "Dropdown" || block.tag === "ButtonGroup") && !explicit) {
      if (options.length > 0) {
        inputs.ensure(name, { kind: "scalar", value: options[0].value });
      }
      return;
    }
    inputs.ensure(
      name,
      defaultInputValue(block.tag, {
        defaultValue: explicit,
        min: number(block.props.min),
      })
    );
  }, [name, block.tag, block.props, options, inputs]);

  if (!name) return <Invalid message={`<${block.tag}> needs a name=`} />;

  const current = values.get(name);
  const scalar = current?.kind === "scalar" ? String(current.value) : "";

  const field = (() => {
    switch (block.tag) {
      case "Dropdown":
        return (
          <Select
            value={scalar}
            onValueChange={(value) => inputs.set(name, { kind: "scalar", value })}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder={title} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "ButtonGroup":
        return (
          <div className="flex flex-wrap gap-1">
            {options.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={scalar === option.value ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => inputs.set(name, { kind: "scalar", value: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </div>
        );

      case "TextInput":
        return (
          <Input
            className="h-8 w-44 text-xs"
            value={scalar}
            placeholder={text(block.props.placeholder)}
            onChange={(event) => inputs.set(name, { kind: "scalar", value: event.target.value })}
          />
        );

      case "DateInput":
      case "DatePicker":
        return (
          <Input
            type="date"
            className="h-8 w-40 text-xs"
            value={scalar}
            onChange={(event) => inputs.set(name, { kind: "scalar", value: event.target.value })}
          />
        );

      case "DateRange": {
        const range =
          current?.kind === "range" ? current : { kind: "range" as const, start: "", end: "" };
        return (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={range.start}
              onChange={(event) => inputs.set(name, { ...range, start: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={range.end}
              onChange={(event) => inputs.set(name, { ...range, end: event.target.value })}
            />
          </div>
        );
      }

      case "Slider": {
        const min = number(block.props.min) ?? 0;
        const max = number(block.props.max) ?? 100;
        const step = number(block.props.step) ?? 1;
        return (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={Number(scalar) || min}
              onChange={(event) =>
                inputs.set(name, { kind: "scalar", value: Number(event.target.value) })
              }
              className="h-1.5 w-40 accent-primary"
            />
            <span className="min-w-8 text-xs tabular-nums">{scalar}</span>
          </div>
        );
      }

      case "Checkbox":
        return (
          <Checkbox
            checked={current?.kind === "scalar" && current.value === true}
            onCheckedChange={(checked) =>
              inputs.set(name, { kind: "scalar", value: checked === true })
            }
          />
        );

      default:
        return null;
    }
  })();

  return (
    <div className="my-2 inline-flex flex-col gap-1 align-top mr-4">
      {title && (
        <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</Label>
      )}
      {field}
    </div>
  );
}
