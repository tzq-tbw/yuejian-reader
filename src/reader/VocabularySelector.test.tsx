import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { WORDLIST_SELECTION_KEY } from "./wordlistSelection";
import "../styles.css";

beforeEach(() => window.localStorage.clear());

describe("阅读页词表标色选择器", () => {
  it("默认三表全选，可自由多选并跨页面重开保留选择", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    const view = render(<App api={api} />);
    await waitFor(() => expect(document.querySelector("mark.cet4")).toHaveTextContent("address"));
    expect(Array.from(document.querySelectorAll("mark.cet6")).find((mark) => mark.textContent === "environmental")).toBeDefined();
    expect(document.querySelector("mark.ky")).toHaveTextContent("address");

    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    const cet4 = screen.getByRole("menuitemcheckbox", { name: /四级高频/ });
    const cet6 = screen.getByRole("menuitemcheckbox", { name: /六级高频/ });
    const ky = screen.getByRole("menuitemcheckbox", { name: /考研高频/ });
    expect(cet4).toHaveAttribute("aria-checked", "true");
    expect(cet6).toHaveAttribute("aria-checked", "true");
    expect(ky).toHaveAttribute("aria-checked", "true");

    await user.click(cet4);
    await user.click(ky);
    await waitFor(() => expect(document.querySelector("mark.cet4")).not.toBeInTheDocument());
    expect(document.querySelector("mark.ky")).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll("mark.cet6")).find((mark) => mark.textContent === "environmental")).toBeDefined();
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe('["cet6"]');

    await user.click(cet4);
    await waitFor(() => expect(document.querySelector("mark.cet4")).toHaveTextContent("address"));
    expect(screen.getByRole("menuitemcheckbox", { name: /四级高频/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /六级高频/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /考研高频/ })).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe('["cet6","cet4"]');

    view.unmount();
    render(<App api={createMockApi(storage)} />);
    await waitFor(() => expect(document.querySelector("mark.cet4")).toHaveTextContent("address"));
    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    expect(screen.getByRole("menuitemcheckbox", { name: /四级高频/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /六级高频/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /考研高频/ })).toHaveAttribute("aria-checked", "false");
  });

  it("选中与未选中菜单项使用可读的前景色和背景色", async () => {
    window.localStorage.setItem(WORDLIST_SELECTION_KEY, '["cet6"]');
    const api = createMockApi(createMemoryStorage());
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    render(<App api={api} />);
    await waitFor(() => expect(document.querySelector("mark.cet6")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /词表标色/ }));

    const cet4 = screen.getByRole("menuitemcheckbox", { name: /四级高频/ });
    expect(cet4).toHaveAttribute("aria-checked", "false");
    expect(window.getComputedStyle(cet4).color).toBe("rgb(51, 75, 105)");
    expect(window.getComputedStyle(cet4).backgroundColor).toBe("rgb(255, 255, 255)");

    const cet6 = screen.getByRole("menuitemcheckbox", { name: /六级高频/ });
    expect(cet6).toHaveAttribute("aria-checked", "true");
    expect(window.getComputedStyle(cet6).color).not.toBe("rgb(255, 255, 255)");
    expect(window.getComputedStyle(cet6).color).toBe("rgb(51, 75, 105)");
    expect(window.getComputedStyle(cet6).backgroundColor).toBe("rgb(237, 243, 252)");
    expect(cet6.querySelector(".wordlistCheck.checked svg")).toBeInTheDocument();
  });

  it("允许全部取消，正文不标色且空选择持久化", async () => {
    const api = createMockApi(createMemoryStorage());
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    render(<App api={api} />);
    await waitFor(() => expect(document.querySelectorAll("mark").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    for (const name of ["四级高频", "六级高频", "考研高频"]) {
      await user.click(screen.getByRole("menuitemcheckbox", { name: new RegExp(name) }));
    }
    await waitFor(() => expect(document.querySelectorAll("mark")).toHaveLength(0));
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe("[]");
    expect(await api.listWords([])).toEqual([]);
  });
});
