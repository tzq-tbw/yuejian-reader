import { useCallback, useEffect, useState } from "react";
import {
  Check,
  DatabaseBackup,
  Download,
  FileUp,
  Link2,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
} from "lucide-react";
import type { ReaderApi, WordlistSummary } from "../data/types";
import { appFiles, type AppFileService, type PickedTextFile } from "../data/files";
import { errorMessage } from "../utils/error";
import { localDateKey } from "../review/schedule";
import { Modal } from "../components/Modal";

interface SettingsPageProps {
  api: ReaderApi;
  notify: (text: string, kind?: "info" | "error") => void;
  onDataDeleted: () => void;
  files?: AppFileService;
}

export function SettingsPage({
  api,
  notify,
  onDataDeleted,
  files = appFiles,
}: SettingsPageProps) {
  const [wordlists, setWordlists] = useState<WordlistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteStage, setDeleteStage] = useState<0 | 1 | 2>(0);
  const [importDraft, setImportDraft] = useState<PickedTextFile | null>(null);
  const [importName, setImportName] = useState("");

  const refreshWordlists = useCallback(async () => {
    try {
      setWordlists(await api.listWordlists());
    } catch (cause) {
      notify(`加载词表失败：${errorMessage(cause)}`, "error");
    } finally {
      setLoading(false);
    }
  }, [api, notify]);

  useEffect(() => {
    void refreshWordlists();
  }, [refreshWordlists]);

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setBusy(null);
    }
  }

  const exportWords = () =>
    run("export", async () => {
      const csv = await api.exportWordFavorites();
      const destination = await files.saveText(`生词本-${localDateKey()}.csv`, csv);
      if (destination) notify(`生词本已导出到 ${destination}`);
    });

  const backup = () =>
    run("backup", async () => {
      const destination = await files.backupDatabase(
        `reader-backup-${localDateKey()}.db`,
        (path) => api.backupDatabase(path),
      );
      if (destination) notify(`数据已备份到 ${destination}`);
    });

  const deleteData = () =>
    run("delete", async () => {
      await api.deleteAllData();
      setDeleteStage(0);
      setWordlists([]);
      onDataDeleted();
      notify("所有学习数据和词表已清空");
    });

  const pickWordlist = () =>
    run("pick", async () => {
      const picked = await files.pickText(["txt", "csv"]);
      if (!picked) return;
      setImportDraft(picked);
      setImportName(picked.name.replace(/\.[^.]+$/, ""));
    });

  const importWordlist = () =>
    run("import", async () => {
      if (!importDraft) return;
      const imported = await api.importWordlist({
        name: importName,
        source: importDraft.name,
        content: importDraft.content,
      });
      setImportDraft(null);
      await refreshWordlists();
      notify(`已导入「${imported.name}」${imported.wordCount} 词，可在阅读页启用`);
    });

  const deleteWordlist = (list: WordlistSummary) => {
    if (!window.confirm(`删除词表「${list.name}」？此操作不会影响文章和收藏。`)) return;
    void run(`wordlist:${list.id}`, async () => {
      await api.deleteWordlist(list.id);
      await refreshWordlists();
      notify(`已删除词表「${list.name}」`);
    });
  };

  return (
    <div className="libraryMain settingsMain">
      <div className="libTop">
        <h1>设置</h1>
        <span className="pageNote">数据保存在本机 · 当前版本 0.1.0</span>
      </div>
      <div className="libScroll">
        <div className="libInner settingsInner">
          <section className="settingsSection" aria-labelledby="settings-data">
            <div className="settingsHeading">
              <DatabaseBackup size={19} />
              <div>
                <h2 id="settings-data">数据与备份</h2>
                <p>导出基础生词信息，或在清理前备份完整 SQLite 数据库。</p>
              </div>
            </div>
            <div className="settingsRows">
              <div className="settingsRow">
                <div><strong>导出生词本</strong><span>CSV 仅含单词、词性和基本意思，不含长难句。</span></div>
                <button type="button" disabled={busy !== null} onClick={() => void exportWords()}>
                  <Download size={15} /> {busy === "export" ? "导出中…" : "选择位置并导出"}
                </button>
              </div>
              <div className="settingsRow">
                <div><strong>备份数据</strong><span>生成包含文章、收藏、复习记录和词表的数据库副本。</span></div>
                <button type="button" disabled={busy !== null} onClick={() => void backup()}>
                  <DatabaseBackup size={15} /> {busy === "backup" ? "备份中…" : "备份数据库"}
                </button>
              </div>
              <div className="settingsRow dangerRow">
                <div><strong>删除数据</strong><span>清空所有业务表，包括文章、收藏、复习记录与全部词表。</span></div>
                <button type="button" className="danger" disabled={busy !== null} onClick={() => setDeleteStage(1)}>
                  <Trash2 size={15} /> 清空所有数据
                </button>
              </div>
            </div>
          </section>

          <section className="settingsSection" aria-labelledby="settings-wordlists">
            <div className="settingsHeading">
              <FileUp size={19} />
              <div>
                <h2 id="settings-wordlists">词表管理</h2>
                <p>内置三库分开存放；导入的新词表也会出现在阅读页标色选择器中。</p>
              </div>
              <button type="button" className="icon" aria-label="刷新词表" onClick={() => void refreshWordlists()}>
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="wordlistImportActions">
              <button type="button" disabled={busy !== null} onClick={() => void pickWordlist()}>
                <Upload size={15} /> 从本地 TXT / CSV 导入
              </button>
              <button type="button" className="ghostButton" onClick={() => notify("GitHub 在线导入将在后续版本接入；当前请先下载 TXT 或 CSV 后导入")}>
                <Link2 size={15} /> 从 GitHub URL 导入（即将支持）
              </button>
            </div>
            {loading ? (
              <div className="busy">正在读取词表…</div>
            ) : wordlists.length === 0 ? (
              <div className="settingsEmpty">还没有词表，请从本地文件导入。</div>
            ) : (
              <div className="wordlistTable" role="list" aria-label="已导入词表">
                {wordlists.map((list) => (
                  <div className="wordlistRow" role="listitem" key={list.id}>
                    <div className="wordlistName">
                      <strong>{list.name}</strong>
                      <span>{list.source}</span>
                    </div>
                    <span>{list.wordCount.toLocaleString()} 词</span>
                    <span className="enabledLabel">{list.enabled && <Check size={13} />} {list.enabled ? "已启用" : "未启用"}</span>
                    <span className="wordlistOrigin">{list.builtIn ? "内置" : "本地导入"}</span>
                    <button
                      type="button"
                      className="icon danger"
                      aria-label={`删除词表 ${list.name}`}
                      disabled={busy !== null}
                      onClick={() => deleteWordlist(list)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="settingsSection" aria-labelledby="settings-update">
            <div className="settingsHeading">
              <Settings size={19} />
              <div><h2 id="settings-update">应用更新</h2><p>当前版本 0.1.0</p></div>
            </div>
            <div className="settingsRow">
              <div><strong>检查上游更新</strong><span>阶段 5 将接入 Tauri updater 与 GitHub Releases。</span></div>
              <button type="button" onClick={() => notify("当前版本 0.1.0；自动检查更新将在阶段 5 接入")}>
                <RefreshCw size={15} /> 检查更新
              </button>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={importDraft !== null}
        title="导入本地词表"
        onClose={() => setImportDraft(null)}
        footer={
          <div className="dialogActions">
            <button type="button" onClick={() => setImportDraft(null)}>取消</button>
            <button type="button" className="primary" disabled={!importName.trim() || busy !== null} onClick={() => void importWordlist()}>
              {busy === "import" ? "导入中…" : "导入"}
            </button>
          </div>
        }
      >
        <label className="dialogField">
          词表名称
          <input data-autofocus value={importName} maxLength={60} onChange={(event) => setImportName(event.target.value)} />
        </label>
        <p className="dialogHint">来源：{importDraft?.name}。支持一行一词，或首列为单词的 CSV；重复词会自动合并。</p>
      </Modal>

      <Modal
        open={deleteStage !== 0}
        title={deleteStage === 1 ? "确认清空所有数据？" : "最后确认"}
        onClose={() => setDeleteStage(0)}
        footer={
          <div className="dialogActions">
            <button type="button" onClick={() => setDeleteStage(0)}>取消</button>
            {deleteStage === 1 ? (
              <button type="button" className="danger" onClick={() => setDeleteStage(2)}>继续</button>
            ) : (
              <button type="button" className="danger" disabled={busy !== null} onClick={() => void deleteData()}>
                {busy === "delete" ? "清空中…" : "永久删除全部数据"}
              </button>
            )}
          </div>
        }
      >
        <p>{deleteStage === 1
          ? "文章、分区、收藏、复习记录和全部词表都会被删除，且无法在应用内撤销。建议先备份数据库。"
          : "这是第二次确认。点击“永久删除全部数据”后将立即清空所有业务表。"}</p>
      </Modal>
    </div>
  );
}
