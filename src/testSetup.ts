import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// 并行跑全套时，等待 React 提交或浮层定位可能略超过默认 1 秒；
// 3 秒只影响真正失败的用例，正常情况下条件一满足就返回。
configure({ asyncUtilTimeout: 3000 });

afterEach(() => cleanup());