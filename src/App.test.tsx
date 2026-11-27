import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { createMemoryStorage, createMockApi, type StorageLike } from "./data/mock";

const TITLE = "The City at Walking Speed";

function paragraphTexts(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("p[data-i]")).map(
    (paragraph) => paragraph.textContent ?? "",
  );
}

async function findParagraph(text: string): Promise<void> {
  await waitFor(() => {
    expect(paragraphTexts()).toContain(text);
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

async function renderApp(storage: StorageLike = createMemoryStorage()) {
  const api = createMockApi(storage);
  const user = userEvent.setup();
  const view = render(<App api={api} />);
  await screen.findAllByText("我的阅读");
  return { api, user, view, storage };
}

async function pasteViaUi(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "资料库" }));
  await screen.findByRole("heading", { name: "资料库" });
  await user.click(screen.getByRole("button", { name: "粘贴新文章" }));
  await user.click(screen.getByRole("button", { name: "保存文章" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("正文不能为空");
  await user.type(screen.getByLabelText("标题"), TITLE);
  fireEvent.change(screen.getByLabelText("正文"), {
    target: {
      value:
        "A city street looks different on foot.\n\nThe second paragraph is here.\n\nThe third paragraph ends the article.",
    },
  });
  await user.click(screen.getByRole("button", { name: "保存文章" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}

describe("本机阅读骨架", () => {
  it("粘贴建篇、编辑第二段、收起双栏，并在重新打开后保留修改", async () => {
    const { user, view, storage } = await renderApp();
    await pasteViaUi(user);

    const row = screen.getByText(TITLE).closest(".libRow") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "阅读" }));

    await waitFor(() => {
      expect(document.querySelectorAll("p[lang='en']").length).toBe(3);
    });
    expect(paragraphTexts()).toContain("The second paragraph is here.");
    expect(document.querySelector(".sheet .meta")).not.toBeInTheDocument();
    const inspector = screen.getByLabelText("精读侧栏");
    expect(within(inspector).getAllByRole("button")).toHaveLength(1);
    expect(inspector.querySelector(".content")).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByLabelText("正文"), {
      target: {
        value:
          "A city street looks different on foot.\n\nThe second paragraph was edited.\n\nThe third paragraph ends the article.",
      },
    });
    await user.click(screen.getByRole("button", { name: "保存" }));
    await findParagraph("The second paragraph was edited.");

    await user.click(screen.getByRole("button", { name: "收起文章列表" }));
    expect(screen.queryByLabelText("阅读列表")).not.toBeInTheDocument();
    expect(paragraphTexts()).toContain("The second paragraph was edited.");
    await user.click(screen.getByRole("button", { name: "展开文章列表" }));
    expect(await screen.findByLabelText("阅读列表")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "收起精读侧栏" }));
    expect(screen.queryByLabelText("精读侧栏")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开精读侧栏" }));
    expect(await screen.findByLabelText("精读侧栏")).toBeInTheDocument();

    view.unmount();
    render(<App api={createMockApi(storage)} />);
    await findParagraph("The second paragraph was edited.");
    expect((await screen.findAllByText("我的阅读")).length).toBeGreaterThan(0);
  });

  it("新建分区、从资料库多选加入、重复显示已添加，并只移除分区的引用", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    await api.pasteArticle({
      title: TITLE,
      text: "A city street looks different on foot.\n\nSecond paragraph.\n\nThird paragraph.",
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findAllByText("我的阅读");
    await findParagraph("Second paragraph.");

    await user.click(screen.getByRole("button", { name: "添加分区或文章" }));
    await user.click(screen.getByRole("menuitem", { name: "新建分区" }));
    await user.type(screen.getByLabelText("分区名称"), "本周精读");
    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const weekGroup = await screen.findByRole("group", { name: "本周精读" });
    expect(within(weekGroup).getByText(/这个分区还没有文章/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "添加分区或文章" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    const target = screen.getByLabelText("添加到分区");
    await user.selectOptions(target, screen.getByRole("option", { name: "本周精读" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeEnabled();
    });
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "添加" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const weekGroupAfter = screen.getByRole("group", { name: "本周精读" });
    expect(within(weekGroupAfter).getByText(TITLE)).toBeInTheDocument();

    // 再次打开选择器：目标分区已有该文章，显示“已添加”且不可重复勾选
    await user.click(screen.getByRole("button", { name: "添加分区或文章" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    await user.selectOptions(
      screen.getByLabelText("添加到分区"),
      screen.getByRole("option", { name: "本周精读" }),
    );
    expect(await screen.findByText("已添加")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));

    // 移除只删除“本周精读”的成员记录
    const weekGroupFinal = screen.getByRole("group", { name: "本周精读" });
    await user.click(
      within(weekGroupFinal).getByRole("button", {
        name: `文章菜单：${TITLE}`,
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "从分区移除" }));
    await waitFor(() => {
      expect(
        within(screen.getByRole("group", { name: "本周精读" })).getByText(
          /这个分区还没有文章/,
        ),
      ).toBeInTheDocument();
    });
    const defaultGroup = screen.getByRole("group", { name: "我的阅读" });
    expect(within(defaultGroup).getByText(TITLE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "资料库" }));
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText("已加入 1 个分区")).toBeInTheDocument();
  });

  it("关闭对话框后焦点回到发起按钮", async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "资料库" }));
    const opener = screen.getByRole("button", { name: "粘贴新文章" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(document.activeElement).toBe(opener);
    });
  });

  it("在资料库只粘贴正文即可保存", async () => {
    const { api, user } = await renderApp();
    await user.click(screen.getByRole("button", { name: "资料库" }));
    await user.click(screen.getByRole("button", { name: "粘贴新文章" }));
    const body = screen.getByLabelText("正文");
    await waitFor(() => expect(body).toHaveFocus());
    await user.type(body, "Students learn in a quiet classroom.");
    await user.click(screen.getByRole("button", { name: "保存文章" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await api.listLibrary()).toEqual(expect.arrayContaining([
      expect.objectContaining({ articles: expect.arrayContaining([
        expect.objectContaining({ title: "Students learn in a quiet classroom.", topic: "教育与学习" }),
      ]) }),
    ]));
  });

  it("粘贴时手填的主题会持久保存", async () => {
    const storage = createMemoryStorage();
    const { user, view } = await renderApp(storage);
    await user.click(screen.getByRole("button", { name: "资料库" }));
    await screen.findByRole("heading", { name: "资料库" });
    await user.click(screen.getByRole("button", { name: "粘贴新文章" }));
    await user.type(screen.getByLabelText("标题"), TITLE);
    // 正文会自动分类为“教育与学习”，手填主题必须覆盖自动分类。
    await user.type(screen.getByLabelText("主题"), "城市与生活");
    fireEvent.change(screen.getByLabelText("正文"), {
      target: {
        value: "Students learn in a quiet classroom.\n\nA teacher explains the lesson.",
      },
    });
    await user.click(screen.getByRole("button", { name: "保存文章" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("城市与生活")).toBeInTheDocument();

    view.unmount();
    const reloadUser = userEvent.setup();
    render(<App api={createMockApi(storage)} />);
    await screen.findAllByText("我的阅读");
    await reloadUser.click(screen.getByRole("button", { name: "资料库" }));
    expect(await screen.findByText("城市与生活")).toBeInTheDocument();
  });

  it("资料库选择器取消后换分区重开不会带上上次勾选", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    await api.pasteArticle({
      title: TITLE,
      text: "A city street looks different on foot.\n\nSecond paragraph.",
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findAllByText("我的阅读");
    await findParagraph("Second paragraph.");

    await user.click(screen.getByRole("button", { name: "添加分区或文章" }));
    await user.click(screen.getByRole("menuitem", { name: "新建分区" }));
    await user.type(screen.getByLabelText("分区名称"), "本周精读");
    await user.click(screen.getByRole("button", { name: "创建" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // 对空分区勾选一篇后取消
    await user.click(screen.getByRole("button", { name: "分区菜单：本周精读" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeEnabled();
    });
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("已选 1 篇")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // 重新对同一分区打开：上次勾选已清空，不能误加
    await user.click(screen.getByRole("button", { name: "分区菜单：本周精读" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeEnabled();
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("已选 0 篇")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(
      within(screen.getByRole("group", { name: "本周精读" })).getByText(
        /这个分区还没有文章/,
      ),
    ).toBeInTheDocument();
  });

  it("连续打开文章时只应用最后一次点击，迟到的旧响应不覆盖", async () => {
    const api = createMockApi(createMemoryStorage());
    const first = await api.pasteArticle({ title: "Article A", text: "Body A." });
    const second = await api.pasteArticle({ title: "Article B", text: "Body B." });
    await api.pasteArticle({ title: "Article C", text: "Body C." });
    const originalGet = api.getArticle;
    const secondDetail = await originalGet(second.id);
    let resolveSecond!: (value: Awaited<ReturnType<typeof originalGet>>) => void;
    const pendingSecond = new Promise<typeof secondDetail>((resolve) => {
      resolveSecond = resolve;
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await findParagraph("Body A.");
    vi.spyOn(api, "getArticle").mockImplementation((id) =>
      id === second.id ? pendingSecond : originalGet(id),
    );

    await user.click(screen.getByText("Article B"));
    await user.click(screen.getByText("Article C"));
    await findParagraph("Body C.");
    await act(async () => {
      resolveSecond(secondDetail);
    });
    expect(paragraphTexts()).toEqual(["Body C."]);
    expect((await api.listSectionArticles("default-section")).map((article) => article.id))
      .toContain(first.id);
  });

  it("分区 A 取消勾选后从分区 B 重开不会误加文章", async () => {
    const storage = createMemoryStorage();
    const api = createMockApi(storage);
    await api.pasteArticle({
      title: TITLE,
      text: "A city street looks different on foot.\n\nSecond paragraph.",
    });
    const user = userEvent.setup();
    render(<App api={api} />);
    await screen.findAllByText("我的阅读");
    await findParagraph("Second paragraph.");

    for (const sectionName of ["分区 A", "分区 B"]) {
      await user.click(screen.getByRole("button", { name: "添加分区或文章" }));
      await user.click(screen.getByRole("menuitem", { name: "新建分区" }));
      await user.type(screen.getByLabelText("分区名称"), sectionName);
      await user.click(screen.getByRole("button", { name: "创建" }));
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(screen.getByRole("group", { name: sectionName })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "分区菜单：分区 A" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeEnabled();
    });
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText("已选 1 篇")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "分区菜单：分区 B" }));
    await user.click(screen.getByRole("menuitem", { name: "从资料库添加" }));
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).toBeEnabled();
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("已选 0 篇")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "添加" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(
      within(screen.getByRole("group", { name: "分区 A" })).getByText(
        /这个分区还没有文章/,
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "分区 B" })).getByText(
        /这个分区还没有文章/,
      ),
    ).toBeInTheDocument();
  });
});
