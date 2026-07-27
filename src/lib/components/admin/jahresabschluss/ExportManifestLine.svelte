<!--
	ExportManifestLine — one entry of an export package's contents (D-Flow
	§2.5/§2.6), SHARED by ja-exports AND gobd-export (one pattern for both). The
	.beleg-line sibling for what's INSIDE a ZIP: a neutral file tile + the mono
	filename EXACTLY as it appears in the ZIP (trust through precision, fed from
	the single-source bundleManifest) + a description + optional right meta.
	`highlight` gives the GoBD-Z3 line a calm, sober ink accent — never
	pink/amber on a legal screen (T18c). The line itself is deliberately neutral
	(a file, not a Betrag).
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import FileText from "@lucide/svelte/icons/file-text";
  import FileSpreadsheet from "@lucide/svelte/icons/file-spreadsheet";
  import FileCode from "@lucide/svelte/icons/file-code";
  import type { Component } from "svelte";

  export interface ExportManifestLineProps {
    /** ZIP path / filename, shown mono, byte-exact. */
    filename: string;
    desc?: string;
    /** Calm accent for the GoBD-Z3 line. */
    highlight?: boolean;
    /** Uppercase badge (e.g. "GoBD-Z3"). */
    badge?: string;
    /** Right-aligned meta (size, page count, …). */
    note?: string;
    class?: string;
    "data-testid"?: string;
  }

  function iconFor(filename: string): Component {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "csv") return FileSpreadsheet;
    if (ext === "xml") return FileCode;
    return FileText;
  }
</script>

<script lang="ts">
  let {
    filename,
    desc,
    highlight = false,
    badge,
    note,
    class: className,
    "data-testid": testId = "export-manifest-line",
  }: ExportManifestLineProps = $props();

  const Icon = $derived(iconFor(filename));
</script>

<div
  class={cn("export-line", className)}
  class:is-highlight={highlight}
  data-testid={testId}
  data-slot="export-manifest-line"
>
  <span class="el-tile">
    <Icon class="size-[17px]" aria-hidden="true" />
  </span>
  <div class="el-meta">
    <div class="el-fn" title={filename}>{filename}</div>
    {#if desc}<div class="el-desc">{desc}</div>{/if}
  </div>
  {#if badge}<span class="el-badge">{badge}</span>{/if}
  {#if note}<span class="el-note">{note}</span>{/if}
</div>

<style>
  .export-line {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--card);
  }
  .export-line + :global(.export-line) {
    margin-top: 8px;
  }
  .el-tile {
    width: 34px;
    height: 42px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--secondary);
    border: 1px solid var(--hairline);
    color: var(--ink-500);
  }
  .el-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .el-fn {
    min-width: 0;
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--ink-900);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .el-desc {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink-500);
  }
  .el-note {
    flex: none;
    font-size: 11.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink-500);
  }
  .el-badge {
    flex: none;
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--sev-info) 14%, transparent);
    color: var(--sev-info);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* Highlighted GoBD-Z3 line — calm ink accent, no alarm. */
  .export-line.is-highlight {
    border-color: color-mix(in srgb, var(--ink-900) 22%, var(--border));
    border-left: 3px solid var(--ink-700);
    background: var(--secondary);
  }
  .export-line.is-highlight .el-tile {
    background: var(--card);
    color: var(--ink-700);
    border-color: var(--border);
  }
</style>
