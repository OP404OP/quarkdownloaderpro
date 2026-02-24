use reqwest::{Client, Method, redirect};
use serde_json::Value;
use std::collections::HashMap;
use url::Url;

const HOST_PAN: &str = "pan.quark.cn";
const HOST_DRIVE_PC: &str = "drive-pc.quark.cn";
const HOST_DRIVE: &str = "drive.quark.cn";
const UOP_HOST: &str = "uop.quark.cn";
const COMMON_PARAMS: &str = "pr=ucpro&fr=pc&uc_param_str=";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) quark-cloud-drive/2.5.20 Chrome/100.0.4896.160 Electron/18.3.5.4-b478491100 Safari/537.36 Channel/pckk_other_ch";
const LOGOUT_CALLBACK_URL: &str = "https://pan.quark.cn";

/// API 路由映射
pub struct ApiRoute {
    pub path: &'static str,
    pub method: Method,
    pub host: &'static str,
}

pub fn get_api_routes() -> HashMap<&'static str, ApiRoute> {
    let mut m = HashMap::new();
    m.insert("/api/share/token", ApiRoute { path: "/1/clouddrive/share/sharepage/token", method: Method::POST, host: HOST_PAN });
    m.insert("/api/share/detail", ApiRoute { path: "/1/clouddrive/share/sharepage/detail", method: Method::GET, host: HOST_PAN });
    m.insert("/api/share/save", ApiRoute { path: "/1/clouddrive/share/sharepage/save", method: Method::POST, host: HOST_DRIVE_PC });
    m.insert("/api/task", ApiRoute { path: "/1/clouddrive/task", method: Method::GET, host: HOST_DRIVE_PC });
    m.insert("/api/file/download", ApiRoute { path: "/1/clouddrive/file/download", method: Method::POST, host: HOST_DRIVE });
    m.insert("/api/file/delete", ApiRoute { path: "/1/clouddrive/file/delete", method: Method::POST, host: HOST_DRIVE });
    m.insert("/api/member", ApiRoute { path: "/1/clouddrive/member", method: Method::GET, host: HOST_DRIVE });
    m
}

fn build_client() -> Client {
    Client::builder()
        .redirect(redirect::Policy::none())
        .danger_accept_invalid_certs(false)
        .build()
        .expect("failed to build HTTP client")
}

pub struct ProxyResponse {
    pub status: u16,
    pub headers: reqwest::header::HeaderMap,
    pub body: bytes::Bytes,
}

/// 通用代理请求 — 对应 JS 版 proxyRequest()
pub async fn proxy_request(
    target_path: &str,
    method: Method,
    cookie: Option<&str>,
    body: Option<bytes::Bytes>,
    query: &str,
    hostname: &str,
    append_common: bool,
) -> Result<ProxyResponse, String> {
    let client = build_client();

    let mut full_path = target_path.to_string();
    if append_common {
        let sep = if full_path.contains('?') { '&' } else { '?' };
        full_path = format!("{}{}{}", full_path, sep, COMMON_PARAMS);
    }
    if !query.is_empty() {
        let sep = if full_path.contains('?') { '&' } else { '?' };
        full_path = format!("{}{}{}", full_path, sep, query);
    }

    let url = format!("https://{}{}", hostname, full_path);

    let mut req = client
        .request(method, &url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://pan.quark.cn/")
        .header("Origin", "https://pan.quark.cn")
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "zh-CN,zh;q=0.9")
        .header("Content-Type", "application/json;charset=UTF-8");

    if let Some(ck) = cookie {
        if !ck.is_empty() {
            req = req.header("Cookie", ck);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let headers = resp.headers().clone();
    let body = resp.bytes().await.map_err(|e| e.to_string())?;

    Ok(ProxyResponse { status, headers, body })
}

pub struct CookieResponse {
    pub status: u16,
    pub body: bytes::Bytes,
    pub cookies: Vec<String>,
}

/// 带重定向跟踪的请求 — 对应 JS 版 fetchWithCookies()
pub async fn fetch_with_cookies(
    start_url: &str,
    existing_cookies: Vec<String>,
) -> Result<CookieResponse, String> {
    let client = build_client();
    let mut all_cookies = existing_cookies;
    let mut current_url = start_url.to_string();
    let mut redirects = 0u32;

    loop {
        if redirects > 5 {
            return Err("Too many redirects".into());
        }

        let cookie_header: String = all_cookies
            .iter()
            .filter_map(|c| c.split(';').next())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("; ");

        let resp = client
            .get(&current_url)
            .header("User-Agent", USER_AGENT)
            .header("Referer", "https://pan.quark.cn/")
            .header("Accept", "text/html,application/json,*/*")
            .header("Cookie", &cookie_header)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        // 收集 set-cookie
        for val in resp.headers().get_all("set-cookie") {
            if let Ok(s) = val.to_str() {
                all_cookies.push(s.to_string());
            }
        }

        let status = resp.status().as_u16();

        if (300..400).contains(&status) {
            if let Some(loc) = resp.headers().get("location") {
                let loc_str = loc.to_str().map_err(|e| e.to_string())?;
                current_url = Url::parse(&current_url)
                    .and_then(|base| base.join(loc_str))
                    .map(|u| u.to_string())
                    .unwrap_or_else(|_| loc_str.to_string());
                redirects += 1;
                continue;
            }
        }

        let body = resp.bytes().await.map_err(|e| e.to_string())?;
        return Ok(CookieResponse { status, body, cookies: all_cookies });
    }
}

/// 拼接 cookie — 对应 JS 版 buildCookieHeader()
pub fn build_cookie_header(raw_cookies: &[String]) -> String {
    let mut latest: HashMap<String, String> = HashMap::new();
    for raw in raw_cookies {
        let pair = raw.split(';').next().unwrap_or("").trim();
        if pair.is_empty() { continue; }
        if let Some(eq) = pair.find('=') {
            let name = pair[..eq].trim().to_string();
            let value = pair[eq + 1..].to_string();
            if !name.is_empty() {
                latest.insert(name, value);
            }
        }
    }
    latest.into_iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("; ")
}

/// 拆分 cookie 字符串 — 对应 JS 版 splitCookieHeader()
pub fn split_cookie_header(header: &str) -> Vec<String> {
    header
        .split(';')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

struct AccountInfo {
    pub is_logged_in: bool,
    pub nickname: String,
    pub message: String,
    pub code: String,
}

fn parse_account_info_state(status: u16, payload: &Value) -> AccountInfo {
    let code_text = payload.get("code").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
    let message_text = payload.get("message")
        .or_else(|| payload.get("msg"))
        .or_else(|| payload.get("error"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let data = payload.get("data");
    let nickname = data
        .and_then(|d| d.get("nickname"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    let has_identity = !nickname.is_empty()
        || data
            .and_then(|d| d.get("mobilekps"))
            .and_then(|v| v.as_str())
            .map_or(false, |s| !s.is_empty());

    let success = payload.get("success").and_then(|v| v.as_bool()).unwrap_or(false)
        || code_text == "OK";

    let combined = format!("{} {}", message_text, code_text);
    let auth_error = combined.contains("未登录")
        || combined.contains("登录失效")
        || combined.to_lowercase().contains("invalid")
        || combined.to_lowercase().contains("expired")
        || combined.to_lowercase().contains("unauthorized")
        || combined.to_lowercase().contains("forbidden");

    let is_logged_in = (200..300).contains(&status) && success && has_identity && !auth_error;

    AccountInfo { is_logged_in, nickname, message: message_text, code: code_text }
}

pub struct AccountVerifyResult {
    pub status_code: u16,
    pub is_logged_in: bool,
    pub nickname: String,
    pub message: String,
    pub code: String,
    pub payload: Value,
}

/// 用 cookie 检查账号状态 — 对应 JS 版 fetchAccountInfoByCookie()
pub async fn fetch_account_info_by_cookie(cookie_header: &str) -> Result<AccountVerifyResult, String> {
    let result = proxy_request(
        "/account/info",
        Method::GET,
        Some(cookie_header),
        None,
        "fr=pc&platform=pc",
        HOST_PAN,
        false,
    )
    .await?;

    let payload: Value = serde_json::from_slice(&result.body).unwrap_or(Value::Null);
    let state = parse_account_info_state(result.status, &payload);

    Ok(AccountVerifyResult {
        status_code: result.status,
        is_logged_in: state.is_logged_in,
        nickname: state.nickname,
        message: state.message,
        code: state.code,
        payload,
    })
}

/// 能否从 /account/info 读到有效信息
pub fn can_read_account_info(status: u16, payload: &Value) -> bool {
    if !(200..300).contains(&status) { return false; }
    if payload.is_null() { return false; }

    let code_text = payload.get("code").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
    let success = payload.get("success").and_then(|v| v.as_bool()).unwrap_or(false) || code_text == "OK";

    if success {
        if let Some(data) = payload.get("data") {
            if data.get("nickname").and_then(|v| v.as_str()).map_or(false, |s| !s.trim().is_empty()) {
                return true;
            }
            if data.get("mobilekps").and_then(|v| v.as_str()).map_or(false, |s| !s.trim().is_empty()) {
                return true;
            }
            if data.as_object().map_or(false, |o| !o.is_empty()) {
                return true;
            }
        }
    }

    let msg = format!(
        "{}",
        payload.get("message").or(payload.get("msg")).or(payload.get("error")).or(payload.get("code"))
            .and_then(|v| v.as_str()).unwrap_or("")
    ).to_lowercase();

    if msg.contains("未登录") || msg.contains("登录失效") || msg.contains("invalid") || msg.contains("expired") || msg.contains("unauthorized") || msg.contains("forbidden") {
        return false;
    }
    false
}

// ==================== 扫码登录 ====================

pub async fn qr_get_token() -> Result<Value, String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let path = format!(
        "/cas/ajax/getTokenForQrcodeLogin?client_id=532&v=1.2&request_id={}",
        request_id
    );
    let result = proxy_request(&path, Method::GET, None, None, "", UOP_HOST, false).await?;
    let mut data: Value = serde_json::from_slice(&result.body).unwrap_or(Value::Null);
    data.as_object_mut().map(|o| o.insert("_request_id".into(), Value::String(request_id)));
    Ok(data)
}

pub async fn qr_query_status(token: &str) -> Result<ProxyResponse, String> {
    let poll_id = uuid::Uuid::new_v4().to_string();
    let path = format!(
        "/cas/ajax/getServiceTicketByQrcodeToken?client_id=532&v=1.2&token={}&request_id={}",
        urlencoding::encode(token),
        urlencoding::encode(&poll_id)
    );
    proxy_request(&path, Method::GET, None, None, "", UOP_HOST, false).await
}

/// 用 service_ticket 换 cookie（含多步补全 __puus）
pub async fn qr_get_cookie(st: &str) -> Result<Value, String> {
    let url = format!(
        "https://pan.quark.cn/account/info?st={}&lw=scan",
        urlencoding::encode(st)
    );

    let result = fetch_with_cookies(&url, vec![]).await?;
    let mut all_raw = result.cookies;
    let mut cookie_str = all_raw.iter()
        .filter_map(|c| c.split(';').next())
        .map(|s| s.trim().to_string())
        .collect::<Vec<_>>()
        .join("; ");

    println!("[qrlogin/cookie] Step1 Cookie 字段: {}", extract_cookie_keys(&cookie_str));

    // Step 2-4: 尝试补全 __puus
    let puus_steps = [
        ("Step2", "https://pan.quark.cn/list"),
        ("Step3", "https://drive-pc.quark.cn/1/clouddrive/file/sort?pr=ucpro&fr=pc&uc_param_str=&pdir_fid=0&_page=1&_size=50&_fetch_total=1&_sort=file_type:asc,updated_at:desc"),
        ("Step4", "https://drive.quark.cn/1/clouddrive/member?pr=ucpro&fr=pc&uc_param_str=&fetch_subscribe=true"),
    ];

    for (step, step_url) in puus_steps {
        if cookie_str.contains("__puus=") { break; }
        println!("[qrlogin/cookie] 缺少 __puus, 尝试 {} ...", step);
        match fetch_with_cookies(step_url, all_raw.clone()).await {
            Ok(r) => {
                if r.cookies.len() > all_raw.len() {
                    all_raw = r.cookies;
                    cookie_str = all_raw.iter()
                        .filter_map(|c| c.split(';').next())
                        .map(|s| s.trim().to_string())
                        .collect::<Vec<_>>()
                        .join("; ");
                    println!("[qrlogin/cookie] {} 新增 Cookie, 总字段: {}", step, extract_cookie_keys(&cookie_str));
                } else {
                    println!("[qrlogin/cookie] {} 未获取到新 Cookie", step);
                }
            }
            Err(e) => println!("[qrlogin/cookie] {} 失败: {}", step, e),
        }
    }

    let has_puus = cookie_str.contains("__puus=");
    if !has_puus {
        println!("[qrlogin/cookie] 警告: 最终仍缺少 __puus, 下载功能可能受限");
    }

    let user_info: Value = serde_json::from_slice(&result.body).unwrap_or(Value::Null);

    Ok(serde_json::json!({
        "cookie": cookie_str,
        "user_info": user_info,
        "missing_puus": !has_puus
    }))
}

// ==================== 退出登录 ====================

pub async fn logout(raw_cookie: &str) -> Result<Value, String> {
    if raw_cookie.trim().is_empty() {
        return Err("缺少登录 Cookie，请先登录后再退出".into());
    }

    let logout_url = format!(
        "https://pan.quark.cn/account/logout?callback={}",
        urlencoding::encode(LOGOUT_CALLBACK_URL)
    );

    let mut logout_request_error = String::new();
    let mut verify_cookie = raw_cookie.to_string();

    match fetch_with_cookies(&logout_url, split_cookie_header(raw_cookie)).await {
        Ok(flow) => {
            let merged = build_cookie_header(&flow.cookies);
            if !merged.is_empty() {
                verify_cookie = merged;
            }
        }
        Err(e) => {
            logout_request_error = e;
        }
    }

    let mut verify_error = String::new();
    let account = match fetch_account_info_by_cookie(&verify_cookie).await {
        Ok(info) => info,
        Err(e) => {
            verify_error = e;
            AccountVerifyResult {
                status_code: 0, is_logged_in: false, nickname: String::new(),
                message: String::new(), code: String::new(), payload: Value::Null,
            }
        }
    };

    let can_read = can_read_account_info(account.status_code, &account.payload);
    let logged_out = if verify_error.is_empty() { !can_read } else { false };

    let message = if !logout_request_error.is_empty() && logged_out {
        "退出请求返回异常，但账号状态已失效".to_string()
    } else if !logout_request_error.is_empty() && !logged_out {
        "退出请求失败，夸克账号仍处于登录状态".to_string()
    } else if !logged_out && !account.nickname.is_empty() {
        format!("退出未生效，当前仍为账号「{}」", account.nickname)
    } else if logged_out {
        "夸克账号已退出登录".to_string()
    } else {
        "夸克账号仍处于登录状态，请稍后重试".to_string()
    };

    Ok(serde_json::json!({
        "ok": logout_request_error.is_empty() && verify_error.is_empty(),
        "logged_out": logged_out,
        "message": message,
        "logout_request_error": logout_request_error,
        "verify_error": verify_error,
        "verify": {
            "endpoint": "/account/info?fr=pc&platform=pc",
            "status_code": account.status_code,
            "code": account.code,
            "message": account.message,
            "nickname": account.nickname,
        }
    }))
}

fn extract_cookie_keys(cookie_str: &str) -> String {
    cookie_str
        .split(';')
        .filter_map(|s| s.trim().split('=').next())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}
