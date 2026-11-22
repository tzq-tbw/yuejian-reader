import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
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
  const [session, setSession] = useState<EssaySession>({ text: "", result: null });
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
    let session: EssaySession = { text: "He go to school.", result: null };
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
});

async function waitForRevisionCount(api: ReaderApi, count: number) {
  await vi.waitFor(async () => {
    expect((await api.listEssayDocuments())[0]?.revisions).toHaveLength(count);
  });
}
