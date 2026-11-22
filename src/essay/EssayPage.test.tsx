import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { createMemoryStorage, createMockApi } from "../data/mock";
import { EssayPage } from "./EssayPage";
import type { AppFileService } from "../data/files";
import type { EssayReview, EssayService, EssaySession } from "./types";

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

function ImportHarness({ files }: { files: AppFileService }) {
  const [session, setSession] = useState<EssaySession>({ text: "", result: null });
  return <EssayPage service={essayService()} session={session} onSessionChange={setSession} files={files} />;
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
    let session: EssaySession = { text: "He go to school.", result: null };
    let generation = 0;
    let view!: ReturnType<typeof render>;
    const page = () => (
      <EssayPage
        key={generation}
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
});
