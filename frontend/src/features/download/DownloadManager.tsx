import React, { useEffect } from 'react';
import { CheckSquare, Square, Loader2, Zap } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useQuarkStore } from '../../store/useQuarkStore';
import { quarkApi } from '../../services/quarkApi';
import { sleep } from '../../utils';
import { formatSize, cn, getErrorMessage } from '../../utils';
import { Button } from '../../components/ui/button';
import type { ShareFileNode } from '../../types/quark';

interface DownloadProgressEvent {
    id: string;
    filename: string;
    downloaded: number;
    total: number;
    speed?: number;
    status?: string;
}

export const DownloadManager: React.FC = () => {
    const {
        shareInfo,
        selectedFids,
        selectAllFiles,
        clearSelection,
        downloading,
        setDownloading,
        setProgress,
        updateDownload,
        removeDownload,
        addLog,
        clearLogs,
        cookie,
        isLoggedIn,
        downloadConcurrency,
        downloadThreads,
        notify
    } = useQuarkStore();

    // 监听 Rust 端发送的 download-progress 事件，按 id 更新 activeDownloads
    useEffect(() => {
        const unlisten = listen<DownloadProgressEvent>('download-progress', (event) => {
            const { id, filename, downloaded, total, speed, status } = event.payload;

            if (status === 'done') {
                // 下载完成，延迟移除让用户看到 100%
                updateDownload(id, { filename, downloaded, total, speed: 0, status: 'done' });
                setTimeout(() => removeDownload(id), 2000);
                return;
            }

            updateDownload(id, {
                filename,
                downloaded,
                total,
                speed: speed ?? 0,
                status: status === 'merging' ? 'merging' : 'downloading',
            });
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [updateDownload, removeDownload]);

    const handleSelectAll = () => {
        if (selectedFids.size === shareInfo.allFiles.length) {
            clearSelection();
        } else {
            selectAllFiles(shareInfo.allFiles.map((f: ShareFileNode) => f.fid));
        }
    };

    const getSelectedSize = () => {
        return shareInfo.allFiles
            .filter((f: ShareFileNode) => selectedFids.has(f.fid))
            .reduce((acc: number, f: ShareFileNode) => acc + f.size, 0);
    };

    const triggerDownload = async (url: string, filename: string) => {
        try {
            const result = await invoke('download_file', {
                url,
                cookie,
                filename,
                threadCount: downloadThreads,
            });
            const res = result as { path?: string; size?: number };
            addLog(`  已保存到: ${res.path ?? '未知路径'}`, 'success');
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            addLog(`下载失败: ${message}`, 'error');
            notify(`下载失败: ${message}`, 'error');
        }
    };

    const startDownload = async () => {
        if (selectedFids.size === 0 || downloading) return;
        if (!isLoggedIn) {
            addLog('请先登录账号', 'warn');
            notify('请先登录账号', 'warn');
            return;
        }

        const filesToDownload = shareInfo.allFiles.filter((f: ShareFileNode) => selectedFids.has(f.fid));
        setDownloading(true);
        clearLogs();

        try {
            const total = filesToDownload.length;
            let done = 0;
            let nextIndex = 0;
            const concurrency = Math.min(downloadConcurrency, total);

            if (total === 0) {
                addLog('没有可处理的文件', 'warn');
                notify('没有可处理的文件', 'warn');
                return;
            }

            setProgress(0, total, `准备中...`);
            addLog(`开始批量处理，共 ${total} 个文件，并发 ${concurrency}`);

            const processFile = async (index: number) => {
                const f = filesToDownload[index];
                addLog(`[${index + 1}/${total}] 正在处理: ${f.file_name}`);

                let savedFid: string | null = null;
                try {
                    addLog('  正在转存到网盘...');
                    const sr = await quarkApi.saveFiles(
                        shareInfo.pwdId,
                        shareInfo.stoken,
                        [f.fid],
                        [f.share_fid_token]
                    );

                    if (sr.status !== 200 || !sr.data) {
                        throw new Error(sr.message || '转存失败');
                    }

                    const taskId = sr.data.task_id;

                    for (let r = 0; r < 20; r++) {
                        await sleep(500);
                        const tr = await quarkApi.queryTask(taskId, r);
                        if (tr.data && tr.data.status === 2) {
                            savedFid = tr.data.save_as?.save_as_top_fids?.[0] ?? null;
                            break;
                        }
                    }

                    if (!savedFid) {
                        addLog('  转存超时或未获取到文件 ID，跳过', 'warn');
                        return;
                    }

                    addLog('  获取下载链接...');
                    const dl = await quarkApi.getDownloadUrl([savedFid]);
                    if (dl.status === 200 && dl.data?.[0]?.download_url) {
                        // 拿到 CDN URL 后立即删除转存文件（URL 自带鉴权 token，删除后仍有效）
                        try {
                            await quarkApi.deleteFiles([savedFid]);
                            addLog('  转存文件已清理');
                        } catch (e: unknown) {
                            addLog(`  转存清理失败: ${getErrorMessage(e)}`, 'warn');
                        }
                        savedFid = null; // 已删除，防止 finally 重复处理

                        await triggerDownload(dl.data[0].download_url, f.file_name);
                    } else {
                        addLog(`  获取链接失败: ${dl.message || '未知错误'}`, 'error');
                    }
                } catch (error: unknown) {
                    const message = getErrorMessage(error);
                    addLog(`  处理出错: ${message}`, 'error');
                } finally {
                    // 如果在获取下载链接之前就失败了，savedFid 仍不为 null，需要兜底清理
                    if (savedFid) {
                        try {
                            await quarkApi.deleteFiles([savedFid]);
                            addLog('  转存文件已兜底清理');
                        } catch (e: unknown) {
                            addLog(`  兜底清理失败: ${getErrorMessage(e)}`, 'warn');
                        }
                    }

                    done += 1;
                    if (done >= total) {
                        setProgress(done, total, '全部完成');
                        setTimeout(() => {
                            setProgress(0, 0, '');
                        }, 3000);
                    } else {
                        const progressText = `正在处理 ${done}/${total}`;
                        setProgress(done, total, progressText);
                    }
                }
            };

            const worker = async () => {
                while (true) {
                    const index = nextIndex;
                    nextIndex += 1;
                    if (index >= total) return;

                    await processFile(index);

                    if (nextIndex < total) {
                        await sleep(300);
                    }
                }
            };

            await Promise.all(Array.from({ length: concurrency }, () => worker()));
            setProgress(total, total, '全部完成');
            addLog(`全部完成，共处理 ${total} 个文件`, 'success');
            notify(`全部完成，共处理 ${total} 个文件`, 'success');
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            addLog(`流程出错: ${message}`, 'error');
            notify(`流程出错: ${message}`, 'error');
        } finally {
            setDownloading(false);
        }
    };

    if (shareInfo.files.length === 0) return null;

    const isAllSelected = selectedFids.size === shareInfo.allFiles.length && shareInfo.allFiles.length > 0;

    return (
        <div className="shrink-0">
            {/* 增加内边距 px-5 py-2.5 以提升卡片纵向空间感 */}
            <div className="flex items-center gap-6 p-2.5 px-5 rounded-[1.2rem]">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleSelectAll}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all",
                            isAllSelected ? "bg-indigo-50/80 text-indigo-600" : "text-slate-400 hover:bg-slate-50/50"
                        )}
                    >
                        {isAllSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        <span>全选</span>
                    </button>

                    <div className="h-4 w-px bg-slate-200/60" />

                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                        <span className="text-slate-400 font-medium text-[9px] uppercase tracking-tighter">已选</span>
                        <span className="flex items-center gap-2">
                            <span className="text-[13px]">{selectedFids.size}</span>
                            <span className="text-indigo-600 font-black text-[10px] bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/30">
                                {formatSize(getSelectedSize())}
                            </span>
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                    <div className="hidden sm:flex items-center px-2.5 h-8 bg-slate-50/80 rounded-lg border border-slate-100/50">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">线程 {downloadThreads} · 并行 {downloadConcurrency}</span>
                    </div>

                    <Button
                        onClick={startDownload}
                        disabled={selectedFids.size === 0 || downloading}
                        variant="gradient"
                        className="px-6 h-9 rounded-lg text-[11px] font-bold flex items-center gap-2 shadow-sm active:scale-95 transition-transform"
                    >
                        {downloading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Zap size={14} className="fill-white" />
                        )}
                        开始任务
                    </Button>
                </div>
            </div>
        </div>
    );
};