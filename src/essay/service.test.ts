import { describe, expect, it, vi } from "vitest";
import { createEssayService } from "./service";
import type { ChatTransport } from "../language/types";

 describe("作文批改服务", () => {
  it("通过 mock transport 提交完整提示词并解析响应", async () => {
    const transport: ChatTransport = {
      chat: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({
          issues: [{ severity: "high", category: "grammar", location: "第1段", original: "He go", suggestion: "He goes", explanation: "主谓一致" }],
          polished: "He goes to school.",
        }) } }],
      }),
    };
    const service = createEssayService({ transport });
    const result = await service.review("He go to school.");
    expect(result.issues[0].suggestion).toBe("He goes");
    expect(result.polished).toBe("He goes to school.");
    expect(transport.chat).toHaveBeenCalledTimes(1);
    const call = vi.mocked(transport.chat).mock.calls[0][0];
    expect(call.maxTokens).toBe(5000);
    expect(call.messages[0].content).toContain("语法错误");
    expect(call.messages[0].content).toContain("拼写");
    expect(call.messages[0].content).toContain("时态");
    expect(call.messages[0].content).toContain("搭配");
    expect(call.messages[1]).toEqual({ role: "user", content: "He go to school." });
  });

  it("空作文不发送请求", async () => {
    const transport: ChatTransport = { chat: vi.fn() };
    await expect(createEssayService({ transport }).review("  ")).rejects.toThrow("请先粘贴");
    expect(transport.chat).not.toHaveBeenCalled();
  });
});
