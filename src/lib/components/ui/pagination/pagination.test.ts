import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import Pagination from "./pagination.svelte";

describe("ui/pagination", () => {
  it("computes range + paginates", async () => {
    const onPageChange = vi.fn();
    render(Pagination, {
      props: { page: 2, pageSize: 50, total: 230, onPageChange },
    });
    expect(screen.getByText(/51.*100.*230/)).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /weiter|next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables Prev on first page", () => {
    render(Pagination, {
      props: { page: 1, pageSize: 50, total: 230, onPageChange: vi.fn() },
    });
    const prev = screen.getByRole("button", { name: /zurück|prev/i });
    expect(prev).toHaveProperty("disabled", true);
  });

  it("disables Next on last page", () => {
    render(Pagination, {
      props: { page: 5, pageSize: 50, total: 230, onPageChange: vi.fn() },
    });
    const next = screen.getByRole("button", { name: /weiter|next/i });
    expect(next).toHaveProperty("disabled", true);
  });

  it("calls onPageChange(page - 1) on Prev click", async () => {
    const onPageChange = vi.fn();
    render(Pagination, {
      props: { page: 3, pageSize: 50, total: 230, onPageChange },
    });
    await fireEvent.click(screen.getByRole("button", { name: /zurück|prev/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders nothing when total <= pageSize", () => {
    const { container } = render(Pagination, {
      props: { page: 1, pageSize: 50, total: 30, onPageChange: vi.fn() },
    });
    expect(container.querySelector('[data-slot="pagination"]')).toBeNull();
  });

  it("has accessible aria-labels on prev/next buttons", () => {
    render(Pagination, {
      props: { page: 2, pageSize: 50, total: 230, onPageChange: vi.fn() },
    });
    expect(screen.getByRole("button", { name: /zurück|prev/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /weiter|next/i })).toBeTruthy();
  });

  it("passes class to root element", () => {
    const { container } = render(Pagination, {
      props: {
        page: 2,
        pageSize: 50,
        total: 230,
        onPageChange: vi.fn(),
        class: "test-class",
      },
    });
    expect(container.querySelector(".test-class")).toBeTruthy();
  });
});
