"use client";

import {
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
} from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
  type SkillCategory,
  type SkillRecord,
  skillCategoryLabels,
  skillPhaseLabels,
  skillStatusLabels,
  skillsCatalog,
} from "@/lib/skills-catalog";

const PAGE_SIZE = 4;

const categoryFilters: Array<{ value: "all" | SkillCategory; label: string }> = [
  { value: "all", label: "全部" },
  { value: "foundation", label: skillCategoryLabels.foundation },
  { value: "ui", label: skillCategoryLabels.ui },
  { value: "agent", label: skillCategoryLabels.agent },
  { value: "safety", label: skillCategoryLabels.safety },
  { value: "deployment", label: skillCategoryLabels.deployment },
];

const columns: ColumnDef<SkillRecord>[] = [
  { accessorKey: "name", header: "Skill" },
  {
    accessorKey: "category",
    header: "分类",
    filterFn: "equals",
  },
  { accessorKey: "phase", header: "阶段" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "use", header: "用途" },
];

export function SkillManager() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [categoryFilter, setCategoryFilter] = useState<"all" | SkillCategory>("all");
  const [search, setSearch] = useState("");

  const data = useMemo(() => skillsCatalog, []);

  const table = useReactTable({
    data,
    columns,
    state: {
      pagination,
      columnFilters,
      globalFilter: search,
    },
    onPaginationChange: setPagination,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _columnId, filterValue) => {
      const query = String(filterValue).trim().toLowerCase();
      if (!query) return true;
      const skill = row.original;
      return (
        skill.name.toLowerCase().includes(query) ||
        skill.use.toLowerCase().includes(query) ||
        skillCategoryLabels[skill.category].includes(query)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function applySearch(value: string) {
    setSearch(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }

  function applyCategory(value: "all" | SkillCategory) {
    setCategoryFilter(value);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    table.getColumn("category")?.setFilterValue(value === "all" ? undefined : value);
  }

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="skill-manager">
      <div className="skill-toolbar">
        <label className="skill-search">
          <Search size={16} />
          <input
            aria-label="搜索 skill"
            onChange={(event) => applySearch(event.target.value)}
            placeholder="搜索 skill 名称或用途"
            type="search"
            value={search}
          />
        </label>
        <div className="skill-filters" role="tablist" aria-label="Skill 分类筛选">
          {categoryFilters.map((filter) => (
            <button
              aria-pressed={categoryFilter === filter.value}
              className={categoryFilter === filter.value ? "skill-filter active" : "skill-filter"}
              key={filter.value}
              onClick={() => applyCategory(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="skill-page-meta">
        <span>
          共 {filteredCount} 项 · 第 {filteredCount === 0 ? 0 : pageIndex + 1} / {Math.max(pageCount, 1)} 页
        </span>
        <span>每页 {PAGE_SIZE} 项</span>
      </div>

      <div className="skill-page-grid">
        {rows.length === 0 ? (
          <div className="skill-empty panel">
            <Sparkles size={18} />
            <p>没有匹配的 skill。试试换个关键词或分类。</p>
          </div>
        ) : (
          rows.map((row) => {
            const skill = row.original;
            return (
              <article className="panel skill-card" key={skill.id}>
                <div className="skill-card-top">
                  <Sparkles size={18} />
                  <span className={`skill-status ${skill.status}`}>{skillStatusLabels[skill.status]}</span>
                </div>
                <h3>{skill.name}</h3>
                <div className="skill-tags">
                  <span>{skillCategoryLabels[skill.category]}</span>
                  <span>{skillPhaseLabels[skill.phase]}</span>
                </div>
                <p>{skill.use}</p>
                {skill.install ? <code>{skill.install}</code> : null}
              </article>
            );
          })
        )}
      </div>

      <div className="skill-pagination">
        <button
          aria-label="上一页"
          className="secondary-action compact"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          type="button"
        >
          <ChevronLeft size={16} />
          上一页
        </button>

        <div className="skill-page-buttons" aria-label="分页">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              aria-current={pageIndex === index ? "page" : undefined}
              className={pageIndex === index ? "skill-page-button active" : "skill-page-button"}
              key={index}
              onClick={() => table.setPageIndex(index)}
              type="button"
            >
              {index + 1}
            </button>
          ))}
        </div>

        <button
          aria-label="下一页"
          className="secondary-action compact"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          type="button"
        >
          下一页
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
