import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { WORDLIST_SELECTION_KEY } from "./wordlistSelection";
import "../styles.css";

beforeEach(() => window.localStorage.clear());

async function importFixtures(api: ReturnType<typeof createMockApi>) {
  const first = await api.importWordlist({ name: "示例 A", source: "a.txt", content: "address" });
  const second = await api.importWordlist({ name: "示例 B", source: "b.txt", content: "address\nenvironmental" });
  const third = await api.importWordlist({ name: "示例 C", source: "c.txt", content: "address" });
  return [first.id, second.id, third.id];
}

describe("阅读页词表标色选择器", () => {
  it("默认全选已导入的词表，可自由多选并跨页面重开保留选择", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    const [first, second, third] = await importFixtures(api);
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    const view = render(<App api={api} />);
    await waitFor(() => expect(document.querySelector("mark." + first)).toHaveTextContent("address"));
    expect(Array.from(document.querySelectorAll("mark." + second)).find((mark) => mark.textContent === "environmental")).toBeDefined();
    expect(document.querySelector("mark." + third)).toHaveTextContent("address");

    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    const firstOption = screen.getByRole("menuitemcheckbox", { name: /示例 A/ });
    const secondOption = screen.getByRole("menuitemcheckbox", { name: /示例 B/ });
    const thirdOption = screen.getByRole("menuitemcheckbox", { name: /示例 C/ });
    expect(firstOption).toHaveAttribute("aria-checked", "true");
    expect(secondOption).toHaveAttribute("aria-checked", "true");
    expect(thirdOption).toHaveAttribute("aria-checked", "true");

    await user.click(firstOption);
    await user.click(thirdOption);
    await waitFor(() => expect(document.querySelector("mark." + first)).not.toBeInTheDocument());
    expect(document.querySelector("mark." + third)).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll("mark." + second)).find((mark) => mark.textContent === "environmental")).toBeDefined();
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe(JSON.stringify([second]));

    await user.click(firstOption);
    await waitFor(() => expect(document.querySelector("mark." + first)).toHaveTextContent("address"));
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 A/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 B/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 C/ })).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe(JSON.stringify([second, first]));

    view.unmount();
    render(<App api={createMockApi(storage)} />);
    await waitFor(() => expect(document.querySelector("mark." + first)).toHaveTextContent("address"));
    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 A/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 B/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /示例 C/ })).toHaveAttribute("aria-checked", "false");
  });

  it("选中与未选中菜单项使用可读的前景色和背景色", async () => {
    const api = createMockApi(createMemoryStorage());
    const [, second] = await importFixtures(api);
    window.localStorage.setItem(WORDLIST_SELECTION_KEY, JSON.stringify([second]));
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    render(<App api={api} />);
    await waitFor(() => expect(document.querySelector("mark." + second)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /词表标色/ }));

    const firstOption = screen.getByRole("menuitemcheckbox", { name: /示例 A/ });
    expect(firstOption).toHaveAttribute("aria-checked", "false");
    expect(window.getComputedStyle(firstOption).color).toBe("rgb(51, 75, 105)");
    expect(window.getComputedStyle(firstOption).backgroundColor).toBe("rgb(255, 255, 255)");

    const secondOption = screen.getByRole("menuitemcheckbox", { name: /示例 B/ });
    expect(secondOption).toHaveAttribute("aria-checked", "true");
    expect(window.getComputedStyle(secondOption).color).not.toBe("rgb(255, 255, 255)");
    expect(window.getComputedStyle(secondOption).color).toBe("rgb(51, 75, 105)");
    expect(window.getComputedStyle(secondOption).backgroundColor).toBe("rgb(237, 243, 252)");
    expect(secondOption.querySelector(".wordlistCheck.checked svg")).toBeInTheDocument();
  });

  it("允许全部取消，正文不标色且空选择持久化", async () => {
    const api = createMockApi(createMemoryStorage());
    await importFixtures(api);
    await api.pasteArticle({ title: "Vocabulary", text: "address environmental" });
    const user = userEvent.setup();
    render(<App api={api} />);
    await waitFor(() => expect(document.querySelectorAll("mark").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /词表标色/ }));
    for (const name of ["示例 A", "示例 B", "示例 C"]) {
      await user.click(screen.getByRole("menuitemcheckbox", { name: new RegExp(name) }));
    }
    await waitFor(() => expect(document.querySelectorAll("mark")).toHaveLength(0));
    expect(window.localStorage.getItem(WORDLIST_SELECTION_KEY)).toBe("[]");
    expect(await api.listWords([])).toEqual([]);
  });
});
