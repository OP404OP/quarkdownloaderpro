// 在 release 模式下隐藏 Windows 控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api_server;
mod quark_client;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

/// 全局下载代际计数器（epoch）。
/// 每次取消时 +1，下载任务持有启动时的 epoch，
/// 发现不匹配即知道自己被取消，无需重置标志，天然无竞态。
static DOWNLOAD_EPOCH: AtomicU64 = AtomicU64::new(0);

/// 判断某 epoch 的下载是否已被取消
fn is_cancelled(epoch: u64) -> bool {
    DOWNLOAD_EPOCH.load(Ordering::Relaxed) != epoch
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch";
const MIN_MULTITHREAD_SIZE: u64 = 10 * 1024 * 1024; // 10MB 以下走单线程

// ── 通用工具 ──────────────────────────────────────────────

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .http1_only()
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))
}

fn add_headers(req: reqwest::RequestBuilder, cookie: &str) -> reqwest::RequestBuilder {
    req.header("User-Agent", UA)
        .header("Cookie", cookie)
        .header("Referer", "https://pan.quark.cn/")
        .header("Accept", "*/*")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .header("Accept-Encoding", "identity")
        .header("Connection", "keep-alive")
}

/// 手动跟随 302 重定向，返回 (最终URL, 响应)
async fn follow_redirects(
    client: &reqwest::Client,
    url: &str,
    cookie: &str,
) -> Result<(String, reqwest::Response), String> {
    let mut current_url = url.to_string();
    let mut redirects = 0u32;

    loop {
        if redirects > 5 {
            return Err("重定向次数过多".into());
        }

        let resp = add_headers(client.get(&current_url), cookie)
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if resp.status().is_redirection() {
            if let Some(loc) = resp.headers().get("location") {
                let next = loc.to_str().map_err(|e| e.to_string())?;
                current_url = url::Url::parse(&current_url)
                    .and_then(|base| base.join(next))
                    .map(|u| u.to_string())
                    .unwrap_or_else(|_| next.to_string());
                println!(
                    "[download] 重定向 #{}: {}...",
                    redirects + 1,
                    &current_url[..current_url.len().min(80)]
                );
                redirects += 1;
                continue;
            }
        }

        return Ok((current_url, resp));
    }
}

/// 解决文件名冲突：存在同名文件时追加 (1), (2), ...
fn resolve_save_path(downloads_dir: &PathBuf, filename: &str) -> PathBuf {
    let mut save_path = downloads_dir.join(filename);
    if !save_path.exists() {
        return save_path;
    }
    let stem = save_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("download")
        .to_string();
    let ext = save_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    let mut i = 1;
    loop {
        let new_name = if ext.is_empty() {
            format!("{} ({})", stem, i)
        } else {
            format!("{} ({}).{}", stem, i, ext)
        };
        save_path = downloads_dir.join(new_name);
        if !save_path.exists() {
            return save_path;
        }
        i += 1;
    }
}

// ── Tauri 命令入口 ───────────────────────────────────────

/// 取消所有正在进行的下载（epoch +1 → 旧任务自动失效）
#[tauri::command]
async fn cancel_downloads() -> Result<serde_json::Value, String> {
    let old = DOWNLOAD_EPOCH.fetch_add(1, Ordering::SeqCst);
    println!("[download] 取消下载 (epoch {} → {})", old, old + 1);
    Ok(serde_json::json!({ "cancelled": true }))
}

#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    url: String,
    cookie: String,
    filename: String,
    thread_count: Option<usize>,
) -> Result<serde_json::Value, String> {
    let thread_count = thread_count.unwrap_or(999).max(1).min(999);
    let downloads_dir = dirs::download_dir().unwrap_or_else(|| PathBuf::from("."));
    let save_path = resolve_save_path(&downloads_dir, &filename);
    let save_path_display = save_path.to_string_lossy().to_string();

    // 捕获当前 epoch——本次下载的"身份证"
    let epoch = DOWNLOAD_EPOCH.load(Ordering::SeqCst);
    // 唯一下载 ID，供前端区分并聚合多个并发下载
    let download_id = uuid::Uuid::new_v4().to_string()[..8].to_string();

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<serde_json::Value, String>>();

    tokio::spawn(async move {
        let result = do_download(app, url, cookie, filename, save_path, epoch, download_id, thread_count).await;
        let _ = tx.send(result);
    });

    match rx.await {
        Ok(result) => result,
        Err(_) => Err(format!("下载任务异常终止: {}", save_path_display)),
    }
}

// ── 下载调度 ─────────────────────────────────────────────

async fn do_download(
    app: tauri::AppHandle,
    url: String,
    cookie: String,
    filename: String,
    save_path: PathBuf,
    epoch: u64,
    download_id: String,
    thread_count: usize,
) -> Result<serde_json::Value, String> {
    if is_cancelled(epoch) {
        return Err("下载已取消".into());
    }

    println!("[download] 开始: {} -> {:?} (epoch={})", filename, save_path, epoch);

    let client = build_client()?;
    let (final_url, resp) = follow_redirects(&client, &url, &cookie).await?;

    if is_cancelled(epoch) {
        return Err("下载已取消".into());
    }

    if resp.status().as_u16() >= 400 {
        let status = resp.status().as_u16();
        let err = resp.text().await.unwrap_or_default();
        return Err(format!(
            "CDN 返回错误 {}: {}",
            status,
            &err[..err.len().min(200)]
        ));
    }

    let total_size: u64 = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let accept_ranges = resp
        .headers()
        .get("accept-ranges")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.contains("bytes"))
        .unwrap_or(false);

    println!(
        "[download] CDN 200, 大小: {} ({:.1} MB), 支持 Range: {}",
        total_size,
        total_size as f64 / 1024.0 / 1024.0,
        accept_ranges
    );

    if accept_ranges && total_size >= MIN_MULTITHREAD_SIZE {
        drop(resp);
        println!("[download] 启用 {} 线程并行下载", thread_count);
        download_multithread(app, client, final_url, cookie, filename, save_path, total_size, epoch, download_id, thread_count)
            .await
    } else {
        println!("[download] 使用单线程下载 (Range 不支持或文件较小)");
        download_single(app, resp, filename, save_path, total_size, epoch, download_id).await
    }
}

// ── 多线程分段下载 ────────────────────────────────────────

async fn download_multithread(
    app: tauri::AppHandle,
    client: reqwest::Client,
    url: String,
    cookie: String,
    filename: String,
    save_path: PathBuf,
    total_size: u64,
    epoch: u64,
    download_id: String,
    thread_count: usize,
) -> Result<serde_json::Value, String> {
    // 1. 为本次下载创建独立临时目录
    let temp_id = uuid::Uuid::new_v4();
    let temp_dir = save_path
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join(format!(".quark_temp_{}", &temp_id.to_string()[..8]));
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("创建临时目录失败: {}", e))?;

    // 2. 计算各段字节范围
    let segment_size = total_size / thread_count as u64;
    let segments: Vec<(u64, u64)> = (0..thread_count)
        .map(|i| {
            let start = i as u64 * segment_size;
            let end = if i == thread_count - 1 {
                total_size - 1
            } else {
                (i as u64 + 1) * segment_size - 1
            };
            (start, end)
        })
        .collect();

    for (i, (s, e)) in segments.iter().enumerate() {
        println!(
            "[download] 段{}: {}-{} ({:.1} MB)",
            i,
            s,
            e,
            (*e - *s + 1) as f64 / 1024.0 / 1024.0
        );
    }

    // 3. 每段独立的进度原子计数器
    let seg_progresses: Vec<Arc<AtomicU64>> = (0..thread_count)
        .map(|_| Arc::new(AtomicU64::new(0)))
        .collect();

    // 4. 进度监控任务
    let monitor_app = app.clone();
    let monitor_filename = filename.clone();
    let monitor_id = download_id.clone();
    let monitor_segs: Vec<Arc<AtomicU64>> = seg_progresses.iter().map(Arc::clone).collect();
    let monitor = tokio::spawn(async move {
        let mut last_downloaded: u64 = 0;
        let mut last_time = std::time::Instant::now();
        loop {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            if is_cancelled(epoch) {
                break;
            }
            let downloaded: u64 = monitor_segs
                .iter()
                .map(|a| a.load(Ordering::Relaxed))
                .sum();
            let now = std::time::Instant::now();
            let dt = now.duration_since(last_time).as_secs_f64();
            let speed = if dt > 0.0 {
                (downloaded.saturating_sub(last_downloaded)) as f64 / dt
            } else {
                0.0
            };
            last_downloaded = downloaded;
            last_time = now;
            let _ = monitor_app.emit(
                "download-progress",
                serde_json::json!({
                    "id": &monitor_id,
                    "filename": &monitor_filename,
                    "downloaded": downloaded,
                    "total": total_size,
                    "speed": speed,
                }),
            );
            if downloaded >= total_size {
                break;
            }
        }
    });

    // 5. 各段并行下载到临时文件
    let mut handles = Vec::with_capacity(thread_count);
    for (i, &(start, end)) in segments.iter().enumerate() {
        let client = client.clone();
        let url = url.clone();
        let cookie = cookie.clone();
        let chunk_path = temp_dir.join(format!("chunk_{}", i));
        let seg_progress = Arc::clone(&seg_progresses[i]);

        handles.push(tokio::spawn(async move {
            download_segment(&client, &url, &cookie, &chunk_path, start, end, seg_progress, i, epoch)
                .await
        }));
    }

    // 6. 等待所有段完成
    let mut errors = Vec::new();
    for (i, handle) in handles.into_iter().enumerate() {
        match handle.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => errors.push(format!("段{}: {}", i, e)),
            Err(e) => errors.push(format!("段{} 任务崩溃: {}", i, e)),
        }
    }

    monitor.abort();

    if !errors.is_empty() {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        println!("[download] 已清理临时目录: {:?}", temp_dir);
        return Err(format!("多线程下载失败:\n{}", errors.join("\n")));
    }

    // 7. 合并前再检查一次
    if is_cancelled(epoch) {
        let _ = tokio::fs::remove_dir_all(&temp_dir).await;
        return Err("下载已取消".into());
    }

    // 8. 合并分片到最终文件
    println!("[download] 合并 {} 个分片到最终文件...", thread_count);
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": &download_id,
            "filename": &filename,
            "downloaded": total_size,
            "total": total_size,
            "status": "merging",
        }),
    );

    {
        let final_file = tokio::fs::File::create(&save_path)
            .await
            .map_err(|e| format!("创建最终文件失败: {}", e))?;
        let mut writer = tokio::io::BufWriter::with_capacity(8 * 1024 * 1024, final_file);

        for i in 0..thread_count {
            let chunk_path = temp_dir.join(format!("chunk_{}", i));
            let mut chunk_file = tokio::fs::File::open(&chunk_path)
                .await
                .map_err(|e| format!("打开分片 {} 失败: {}", i, e))?;
            tokio::io::copy(&mut chunk_file, &mut writer)
                .await
                .map_err(|e| format!("合并分片 {} 失败: {}", i, e))?;
        }

        writer
            .flush()
            .await
            .map_err(|e| format!("flush 失败: {}", e))?;
    }

    // 9. 清理临时目录
    let _ = tokio::fs::remove_dir_all(&temp_dir).await;
    println!("[download] 临时文件已清理");

    // 最终进度
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": &download_id,
            "filename": &filename,
            "downloaded": total_size,
            "total": total_size,
            "status": "done",
        }),
    );

    Ok(serde_json::json!({
        "path": save_path.to_string_lossy(),
        "size": total_size,
    }))
}

/// 单个段的下载逻辑：Range 请求 → 写入独立临时文件
async fn download_segment(
    client: &reqwest::Client,
    url: &str,
    cookie: &str,
    chunk_path: &PathBuf,
    start: u64,
    end: u64,
    progress: Arc<AtomicU64>,
    index: usize,
    epoch: u64,
) -> Result<(), String> {
    let range_header = format!("bytes={}-{}", start, end);

    let resp = add_headers(client.get(url), cookie)
        .header("Range", &range_header)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = resp.status().as_u16();
    if status != 206 && status != 200 {
        return Err(format!("CDN 返回 {} (期望 206)", status));
    }

    if status == 200 {
        return Err("CDN 不支持 Range 请求 (返回 200 而非 206)".into());
    }

    let file = tokio::fs::File::create(chunk_path)
        .await
        .map_err(|e| format!("创建临时文件失败: {}", e))?;

    let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file);
    let mut resp = resp;
    let mut seg_downloaded: u64 = 0;
    let expected = end - start + 1;

    loop {
        if is_cancelled(epoch) {
            return Err("下载已取消".into());
        }
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                writer
                    .write_all(&chunk)
                    .await
                    .map_err(|e| format!("写入失败: {}", e))?;
                seg_downloaded += chunk.len() as u64;
                progress.store(seg_downloaded, Ordering::Relaxed);
            }
            Ok(None) => break,
            Err(e) => {
                return Err(format!(
                    "传输中断: {} (已下载 {}/{})",
                    e, seg_downloaded, expected
                ));
            }
        }
    }

    writer
        .flush()
        .await
        .map_err(|e| format!("flush 失败: {}", e))?;

    println!(
        "[download] 段{} 完成: {}/{} bytes",
        index, seg_downloaded, expected
    );

    Ok(())
}

// ── 单线程下载（Range 不可用时的回退） ───────────────────

async fn download_single(
    app: tauri::AppHandle,
    mut resp: reqwest::Response,
    filename: String,
    save_path: PathBuf,
    total_size: u64,
    epoch: u64,
    download_id: String,
) -> Result<serde_json::Value, String> {
    let file = tokio::fs::File::create(&save_path)
        .await
        .map_err(|e| format!("创建文件失败: {}", e))?;
    let mut writer = tokio::io::BufWriter::with_capacity(8 * 1024 * 1024, file);

    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    let mut last_downloaded: u64 = 0;

    loop {
        if is_cancelled(epoch) {
            drop(writer);
            let _ = tokio::fs::remove_file(&save_path).await;
            return Err("下载已取消".into());
        }
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                writer
                    .write_all(&chunk)
                    .await
                    .map_err(|e| format!("写入失败: {}", e))?;
                downloaded += chunk.len() as u64;

                if last_emit.elapsed() >= std::time::Duration::from_millis(500) {
                    let now = std::time::Instant::now();
                    let dt = now.duration_since(last_emit).as_secs_f64();
                    let speed = if dt > 0.0 {
                        (downloaded.saturating_sub(last_downloaded)) as f64 / dt
                    } else {
                        0.0
                    };
                    last_downloaded = downloaded;
                    let _ = app.emit(
                        "download-progress",
                        serde_json::json!({
                            "id": &download_id,
                            "filename": &filename,
                            "downloaded": downloaded,
                            "total": total_size,
                            "speed": speed,
                        }),
                    );
                    last_emit = now;
                }
            }
            Ok(None) => break,
            Err(e) => {
                let _ = tokio::fs::remove_file(&save_path).await;
                return Err(format!("下载中断: {} (已下载 {})", e, downloaded));
            }
        }
    }

    writer
        .flush()
        .await
        .map_err(|e| format!("flush 失败: {}", e))?;

    println!(
        "[download] 单线程完成: {} ({:.1} MB, {} bytes)",
        filename,
        downloaded as f64 / 1024.0 / 1024.0,
        downloaded
    );

    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": &download_id,
            "filename": &filename,
            "downloaded": downloaded,
            "total": total_size,
            "status": "done",
        }),
    );

    Ok(serde_json::json!({
        "path": save_path.to_string_lossy(),
        "size": downloaded,
    }))
}

// ── 主入口 ───────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![download_file, cancel_downloads])
        .setup(|app| {
            // 手动创建主窗口（而非 tauri.conf.json 自动创建），
            // 这样才能在 Builder 上注册 on_navigation 回调
            let _main_window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Quark Downloader Pro")
            .inner_size(1024.0, 750.0)
            .min_inner_size(1024.0, 700.0)
            .resizable(true)
            .decorations(false)
            .shadow(true)
            .center()
            .on_navigation(|_url| {
                let old = DOWNLOAD_EPOCH.fetch_add(1, Ordering::SeqCst);
                println!(
                    "[download] 检测到页面导航/刷新，取消下载 (epoch {} → {})",
                    old,
                    old + 1
                );
                true // 允许导航继续
            })
            .build()
            .expect("创建主窗口失败");

            // 启动内嵌 HTTP 服务（axum）
            let port: u16 = std::env::var("PORT")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3000);

            tauri::async_runtime::spawn(async move {
                let router = api_server::create_router();
                let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port))
                    .await
                    .expect("failed to bind API server port");
                println!("[quark-api] 内嵌服务已启动: http://127.0.0.1:{}", port);
                axum::serve(listener, router)
                    .await
                    .expect("API server error");
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}