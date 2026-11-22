import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { EssayPage } from "./EssayPage";
import type { AppFileService } from "../data/files";
import type { EssayReview, EssayService, EssaySession } from "./types";
import type { ReaderApi } from "../data/types";

const reviewResult: EssayReview = {
  issues: [{
    severity: "high",
    category: "grammar",
    location: "第1段第1句",
    original: "He go to school.",
    suggestion: "He goes to school.",
    explanation: "主语是第三人称单数。",
  }],
  polished: "He goes to school every day.",
};

function essayService(): EssayService {
  return { review: vi.fn().mockResolvedValue(reviewResult) };
}

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function ImportHarness({ files, api, service = essayService() }: { files?: AppFileService; api?: ReaderApi; service?: EssayService }) {
  const [session, setSession] = useState<EssaySession>({ documentId: null, text: "", result: null, dirty: false, pendingId: null });
  const [fallbackApi] = useState(() => createMockApi(createMemoryStorage()));
  return <EssayPage api={api ?? fallbackApi} service={service} session={session} onSessionChange={setSession} files={files} />;
}

describe("作文批改页面", () => {
  it("粘贴、分节展示、切换页面保留会话并可重新批改", async () => {
    const service = essayService();
    const user = userEvent.setup();
    render(<App api={createMockApi(createMemoryStorage())} essayService={service} />);
    await user.click(await screen.findByRole("button", { name: "作文批改" }));
    await user.type(screen.getByLabelText("作文正文"), "He go to school.");
    await user.click(screen.getByRole("button", { name: "提交 AI 批改" }));

    expect(await screen.findByRole("heading", { name: "严重问题" })).toBeInTheDocument();
    expect(screen.getByText("He go to school.", { selector: "del" })).toBeInTheDocument();
    expect(screen.getByText("He goes to school.")).toBeInTheDocument();
    expect(screen.getByText("主语是第三人称单数。")).toBeInTheDocument();
    expect(screen.getByText("He goes to school every day.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "精读" }));
    await user.click(screen.getByRole("button", { name: "作文批改" }));
    expect(screen.getByLabelText("作文正文")).toHaveValue("He go to school.");
    expect(screen.getByText("He goes to school every day.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "重新批改" })[0]);
    expect(service.review).toHaveBeenCalledTimes(2);
  });

  it("旧批改响应在新请求后返回时不覆盖新结果", async () => {
    const first = defer<EssayReview>();
    const second = defer<EssayReview>();
    const service: EssayService = {
      review: vi.fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    };
    const user = userEvent.setup();
    const api = createMockApi(createMemoryStorage());
    let session: EssaySession = { documentId: null, text: "He go to school.", result: null, dirty: true, pendingId: null };
    let generation = 0;
    let view!: ReturnType<typeof render>;
    const page = () => (
      <EssayPage
        key={generation}
        api={api}
        service={service}
        session={session}
        onSessionChange={(update) => {
          session = typeof update === "function" ? update(session) : update;
          view.rerender(page());
        }}
      />
    );
    view = render(page());

    await user.click(screen.getByRole("button", { name: "提交 AI 批改" }));
    expect(service.review).toHaveBeenCalledTimes(1);

    session = { ...session, pendingId: null };
    generation += 1;
    view.rerender(page());
    await user.click(screen.getByRole("button", { name: "提交 AI 批改" }));
    expect(service.review).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ issues: [], polished: "The latest review." });
    });
    expect(await screen.findByText("The latest review.")).toBeInTheDocument();

    await act(async () => {
      first.resolve(reviewResult);
    });
    expect(screen.getByText("The latest review.")).toBeInTheDocument();
    expect(screen.queryByText("He goes to school every day.")).not.toBeInTheDocument();
  });

  it("从本地 TXT 导入作文且不自动保存", async () => {
    const files: AppFileService = {
      saveText: vi.fn(),
      backupDatabase: vi.fn(),
      pickText: vi.fn().mockResolvedValue({ name: "essay.txt", content: "An imported essay." }),
    };
    const user = userEvent.setup();
    render(<ImportHarness files={files} />);
    await user.click(screen.getByRole("button", { name: "导入 TXT" }));
    expect(screen.getByLabelText("作文正文")).toHaveValue("An imported essay.");
    expect(files.pickText).toHaveBeenCalledWith(["txt"]);
    expect(window.localStorage.getItem("yuejian.essay")).toBeNull();
  });

  it("历史默认收起，同篇批改追加序号下并可在侧边栏重命名和恢复", async () => {
    const api = createMockApi(createMemoryStorage());
    const service = essayService();
    const user = userEvent.setup();
    const view = render(<ImportHarness api={api} service={service} />);
    expect(screen.queryByRole("complementary", { name: "作文历史" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("作文正文"), "He go to school.");
    await user.click(screen.getByRole("button", { name: "提交 AI 批改" }));
    expect(await screen.findByText("He goes to school every day.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "重新批改" })[0]);
    await waitForRevisionCount(api, 2);

    await user.click(screen.getByRole("button", { name: "作文历史" }));
    const history = screen.getByRole("complementary", { name: "作文历史" });
    const composer = screen.getByRole("region", { name: "英语作文" });
    expect(screen.getByRole("button", { name: "选择作文 1" })).toHaveTextContent("1");
    expect(screen.queryByRole("button", { name: "第 1 次批改" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开作文 1 的批改记录" }));
    expect(screen.getByRole("button", { name: "第 1 次批改" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 2 次批改" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收起作文 1 的批改记录" }));
    expect(screen.queryByRole("button", { name: "第 1 次批改" })).not.toBeInTheDocument();

    expect(within(composer).queryByRole("button", { name: "重命名修改区" })).not.toBeInTheDocument();
    await user.click(within(history).getByRole("button", { name: "重命名修改区" }));
    const name = within(history).getByLabelText("修改区名称");
    expect(within(composer).queryByLabelText("修改区名称")).not.toBeInTheDocument();
    await user.clear(name);
    await user.type(name, "26四级作文");
    await user.click(within(history).getByRole("button", { name: "保存修改区名称" }));
    expect(await within(history).findByText("26四级作文")).toBeInTheDocument();
    expect((await api.listEssayDocuments())[0].revisions).toHaveLength(2);

    view.unmount();
    render(<ImportHarness api={api} service={service} />);
    expect(await screen.findByText("26四级作文")).toBeInTheDocument();
    expect(screen.getByLabelText("作文正文")).toHaveValue("He go to school.");
    expect(await screen.findByText("He goes to school every day.")).toBeInTheDocument();
  });

  it("两篇作文打开 B 后切页返回，选中与正文一致且不会写入 A", async () => {
    const api = createMockApi(createMemoryStorage());
    const first = await api.createEssayDocument({ name: "作文 A", text: "Essay A original." });
    const second = await api.createEssayDocument({ name: "作文 B", text: "Essay B original." });
    const update = vi.spyOn(api, "updateEssayText");
    const user = userEvent.setup();
    render(<App api={api} essayService={essayService()} />);

    await user.click(await screen.findByRole("button", { name: "作文批改" }));
    await user.click(screen.getByRole("button", { name: "作文历史" }));
    await user.click(await screen.findByRole("button", { name: "选择作文 2" }));
    const textarea = screen.getByLabelText("作文正文");
    expect(textarea).toHaveValue("Essay B original.");
    await user.type(textarea, " Draft B.");
    await user.click(screen.getByRole("button", { name: "精读" }));
    await user.click(screen.getByRole("button", { name: "作文批改" }));

    expect(await screen.findByLabelText("作文正文")).toHaveValue("Essay B original. Draft B.");
    expect(screen.getByText("修改区 2")).toBeInTheDocument();
    expect(window.localStorage.getItem("yuejian.essay.selectedDocumentId")).toBe(String(second.id));
    await waitFor(async () => {
      expect((await api.getEssayDocument(second.id)).text).toBe("Essay B original. Draft B.");
    });
    expect((await api.getEssayDocument(first.id)).text).toBe("Essay A original.");
    expect(update.mock.calls.every(([id]) => id === second.id)).toBe(true);
  });

  it("编辑 A 时预览 B 的历史，切页返回仍保留 A 的草稿与归属", async () => {
    const api = createMockApi(createMemoryStorage());
    const first = await api.createEssayDocument({ name: "作文 A", text: "Essay A original." });
    const second = await api.createEssayDocument({ name: "作文 B", text: "Essay B original." });
    await api.addEssayRevision({
      documentId: second.id,
      text: "Essay B history.",
      result: reviewResult,
    });
    const update = vi.spyOn(api, "updateEssayText");
    const user = userEvent.setup();
    render(<App api={api} essayService={essayService()} />);

    await user.click(await screen.findByRole("button", { name: "作文批改" }));
    await user.click(screen.getByRole("button", { name: "作文历史" }));
    await user.click(await screen.findByRole("button", { name: "选择作文 1" }));
    expect(screen.getByLabelText("作文正文")).toHaveValue("Essay A original.");
    await user.type(screen.getByLabelText("作文正文"), " A draft.");
    await user.click(screen.getByRole("button", { name: "展开作文 2 的批改记录" }));
    await user.click(await screen.findByRole("button", { name: "第 1 次批改" }));

    expect(screen.getByLabelText("作文正文")).toHaveValue("Essay B history.");
    const previewComposer = screen.getByRole("region", { name: "英语作文" });
    expect(within(previewComposer).getByText("修改区 2")).toBeInTheDocument();
    expect(within(previewComposer).getByText("作文 B")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "精读" }));
    await user.click(screen.getByRole("button", { name: "作文批改" }));

    expect(await screen.findByLabelText("作文正文")).toHaveValue("Essay A original. A draft.");
    const composer = screen.getByRole("region", { name: "英语作文" });
    expect(within(composer).getByText("修改区 1")).toBeInTheDocument();
    expect(within(composer).getByText("作文 A")).toBeInTheDocument();
    expect(window.localStorage.getItem("yuejian.essay.selectedDocumentId")).toBe(String(first.id));
    await waitFor(async () => {
      expect((await api.getEssayDocument(first.id)).text).toBe("Essay A original. A draft.");
    });

    await user.type(screen.getByLabelText("作文正文"), " Again.");
    fireEvent.blur(screen.getByLabelText("作文正文"));
    await waitFor(() => {
      expect(update).toHaveBeenLastCalledWith(first.id, "Essay A original. A draft. Again.");
    });
    expect(update.mock.calls.every(([id]) => id === first.id)).toBe(true);
    expect((await api.getEssayDocument(second.id)).text).toBe("Essay B history.");
  });

  it("历史版本只读，显式恢复后也只有再次修改才保存", async () => {
    const api = createMockApi(createMemoryStorage());
    const document = await api.createEssayDocument({ text: "Latest essay." });
    await api.addEssayRevision({
      documentId: document.id,
      text: "Old essay.",
      result: { issues: [], polished: "Old polished." },
    });
    await api.addEssayRevision({
      documentId: document.id,
      text: "Latest essay.",
      result: { issues: [], polished: "Latest polished." },
    });
    const update = vi.spyOn(api, "updateEssayText");
    const user = userEvent.setup();
    render(<ImportHarness api={api} />);
    expect(await screen.findByLabelText("作文正文")).toHaveValue("Latest essay.");

    await user.click(screen.getByRole("button", { name: "作文历史" }));
    await user.click(screen.getByRole("button", { name: "展开作文 1 的批改记录" }));
    await user.click(await screen.findByRole("button", { name: "第 1 次批改" }));
    const preview = screen.getByLabelText("作文正文");
    expect(preview).toHaveValue("Old essay.");
    expect(preview).toHaveAttribute("readonly");
    fireEvent.blur(preview);
    expect(update).not.toHaveBeenCalled();
    expect((await api.getEssayDocument(document.id)).text).toBe("Latest essay.");

    await user.click(screen.getByRole("button", { name: "恢复此版本" }));
    expect(screen.getByLabelText("作文正文")).not.toHaveAttribute("readonly");
    fireEvent.blur(screen.getByLabelText("作文正文"));
    expect(update).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("作文正文"), " Edited.");
    fireEvent.blur(screen.getByLabelText("作文正文"));
    await waitFor(() => expect(update).toHaveBeenCalledWith(document.id, "Old essay. Edited."));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("作文列表只取摘要，展开才读历史且操作后不重载整表", async () => {
    const api = createMockApi(createMemoryStorage());
    const first = await api.createEssayDocument({ text: "Essay A." });
    await api.addEssayRevision({ documentId: first.id, text: "Essay A.", result: reviewResult });
    const second = await api.createEssayDocument({ text: "Essay B." });
    await api.addEssayRevision({ documentId: second.id, text: "Essay B.", result: reviewResult });
    const summaries = vi.spyOn(api, "listEssaySummaries");
    const documents = vi.spyOn(api, "listEssayDocuments");
    const getDocument = vi.spyOn(api, "getEssayDocument");
    const user = userEvent.setup();
    render(<ImportHarness api={api} />);

    await user.click(await screen.findByRole("button", { name: "作文历史" }));
    expect(summaries).toHaveBeenCalledTimes(1);
    expect(documents).not.toHaveBeenCalled();
    expect(getDocument.mock.calls.map(([id]) => id)).toEqual([first.id]);
    await user.click(screen.getByRole("button", { name: "展开作文 2 的批改记录" }));
    expect(await screen.findByRole("button", { name: "第 1 次批改" })).toBeInTheDocument();
    expect(getDocument.mock.calls.map(([id]) => id)).toEqual([first.id, second.id]);

    await user.click(screen.getByRole("button", { name: "重命名修改区" }));
    await user.type(screen.getByLabelText("修改区名称"), "新名字");
    await user.click(screen.getByRole("button", { name: "保存修改区名称" }));
    expect((await screen.findAllByText("未命名作文新名字")).length).toBeGreaterThan(0);
    expect(summaries).toHaveBeenCalledTimes(1);
  });

  it("新建、重命名和删除作文都只局部更新列表", async () => {
    const api = createMockApi(createMemoryStorage());
    await api.createEssayDocument({ text: "Essay A." });
    await api.createEssayDocument({ text: "Essay B." });
    const summaries = vi.spyOn(api, "listEssaySummaries");
    const documents = vi.spyOn(api, "listEssayDocuments");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ImportHarness api={api} />);

    expect(await screen.findByLabelText("作文正文")).toHaveValue("Essay A.");
    await user.click(screen.getByRole("button", { name: "作文历史" }));
    await user.click(screen.getByRole("button", { name: "重命名修改区" }));
    await user.type(screen.getByLabelText("修改区名称"), "新名字");
    await user.click(screen.getByRole("button", { name: "保存修改区名称" }));
    expect((await screen.findAllByText("未命名作文新名字")).length).toBeGreaterThan(0);
    expect(documents).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "新建作文" }));
    expect(await screen.findByRole("button", { name: "选择作文 3" })).toBeInTheDocument();
    expect(documents).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除作文 2" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "选择作文 2" })).not.toBeInTheDocument();
    });
    expect(documents).not.toHaveBeenCalled();
    expect(summaries).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it("清空数据重置作文会话并使在途批改不能重新入库", async () => {
    const pending = defer<EssayReview>();
    const service: EssayService = { review: vi.fn().mockReturnValue(pending.promise) };
    const api = createMockApi(createMemoryStorage());
    const user = userEvent.setup();
    render(<App api={api} essayService={service} />);
    await user.click(await screen.findByRole("button", { name: "作文批改" }));
    await user.type(screen.getByLabelText("作文正文"), "Essay pending deletion.");
    await user.click(screen.getByRole("button", { name: "提交 AI 批改" }));
    await user.click(screen.getByRole("button", { name: "设置" }));
    await user.click(await screen.findByRole("button", { name: "清空所有数据" }));
    await user.click(screen.getByRole("button", { name: "继续" }));
    await user.click(screen.getByRole("button", { name: "永久删除全部数据" }));

    await act(async () => {
      pending.resolve(reviewResult);
    });
    expect(await api.listEssayDocuments()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "作文批改" }));
    expect(await screen.findByLabelText("作文正文")).toHaveValue("");
    expect(screen.queryByText("He goes to school every day.")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("yuejian.essay.selectedDocumentId")).toBeNull();
  });
});

async function waitForRevisionCount(api: ReaderApi, count: number) {
  await vi.waitFor(async () => {
    expect((await api.listEssayDocuments())[0]?.revisions).toHaveLength(count);
  });
}
