use axum::{
    Router,
    extract::Query,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use reqwest::Method;
use serde::Deserialize;
use serde_json::{Value, json};
use tower_http::cors::{CorsLayer, Any};

use crate::quark_client;

pub fn create_router() -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([header::HeaderName::from_static("x-append-cookie")]);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/qrlogin/token", get(qr_token))
        .route("/api/qrlogin/query", get(qr_query))
        .route("/api/qrlogin/cookie", get(qr_cookie))
        .route("/api/logout", post(logout))
        // API 代理路由
        .route("/api/share/token", post(api_proxy))
        .route("/api/share/detail", get(api_proxy))
        .route("/api/share/save", post(api_proxy))
        .route("/api/task", get(api_proxy))
        .route("/api/file/download", post(api_proxy))
        .route("/api/file/delete", post(api_proxy))
        .route("/api/member", get(api_proxy))
        .layer(cors)
}

fn json_response(status: StatusCode, body: Value) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        serde_json::to_string(&body).unwrap_or_default(),
    )
        .into_response()
}

fn extract_cookie(headers: &HeaderMap) -> String {
    headers
        .get("x-cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string()
}

// ==================== Health ====================

async fn health() -> Response {
    json_response(StatusCode::OK, json!({ "ok": true, "service": "quark-api-rust" }))
}

// ==================== 扫码登录 ====================

async fn qr_token() -> Response {
    match quark_client::qr_get_token().await {
        Ok(data) => json_response(StatusCode::OK, data),
        Err(e) => json_response(StatusCode::BAD_GATEWAY, json!({ "error": e })),
    }
}

#[derive(Deserialize)]
struct QrQueryParams {
    token: Option<String>,
}

async fn qr_query(Query(params): Query<QrQueryParams>) -> Response {
    let token = match params.token {
        Some(t) if !t.is_empty() => t,
        _ => return json_response(StatusCode::BAD_REQUEST, json!({ "error": "Missing token" })),
    };

    match quark_client::qr_query_status(&token).await {
        Ok(result) => {
            let body: Value = serde_json::from_slice(&result.body).unwrap_or(Value::Null);
            json_response(StatusCode::from_u16(result.status).unwrap_or(StatusCode::OK), body)
        }
        Err(e) => json_response(StatusCode::BAD_GATEWAY, json!({ "error": e })),
    }
}

#[derive(Deserialize)]
struct QrCookieParams {
    service_ticket: Option<String>,
}

async fn qr_cookie(Query(params): Query<QrCookieParams>) -> Response {
    let st = match params.service_ticket {
        Some(s) if !s.is_empty() => s,
        _ => return json_response(StatusCode::BAD_REQUEST, json!({ "error": "Missing service_ticket" })),
    };

    match quark_client::qr_get_cookie(&st).await {
        Ok(data) => json_response(StatusCode::OK, data),
        Err(e) => json_response(StatusCode::BAD_GATEWAY, json!({ "error": e })),
    }
}

// ==================== 退出登录 ====================

async fn logout(headers: HeaderMap) -> Response {
    let cookie = extract_cookie(&headers);
    match quark_client::logout(&cookie).await {
        Ok(data) => json_response(StatusCode::OK, data),
        Err(e) => json_response(StatusCode::BAD_REQUEST, json!({ "error": e })),
    }
}

// ==================== API 代理 ====================

async fn api_proxy(
    method: axum::http::Method,
    uri: axum::http::Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    let path = uri.path();
    let routes = quark_client::get_api_routes();

    let route = match routes.get(path) {
        Some(r) => r,
        None => return json_response(StatusCode::NOT_FOUND, json!({ "error": "Not Found", "path": path })),
    };

    let cookie = extract_cookie(&headers);
    let query = uri.query().unwrap_or("").to_string();

    let req_method = match method {
        axum::http::Method::POST => Method::POST,
        _ => route.method.clone(),
    };

    let body_opt = if body.is_empty() { None } else { Some(body.into()) };

    match quark_client::proxy_request(
        route.path,
        req_method,
        Some(&cookie),
        body_opt,
        &query,
        route.host,
        true,
    )
    .await
    {
        Ok(result) => {
            let mut resp_headers = vec![(
                header::CONTENT_TYPE,
                "application/json; charset=utf-8".to_string(),
            )];

            // 检查 __puus cookie
            if let Some(set_cookie) = result.headers.get("set-cookie") {
                if let Ok(sc_str) = set_cookie.to_str() {
                    if sc_str.starts_with("__puus=") {
                        let puus_val = sc_str.split(';').next().unwrap_or("");
                        resp_headers.push((
                            header::HeaderName::from_static("x-append-cookie"),
                            puus_val.to_string(),
                        ));
                        println!("[api-proxy] 捕获到 __puus cookie!");
                    }
                }
            }
            // 也检查多个 set-cookie
            for val in result.headers.get_all("set-cookie") {
                if let Ok(sc_str) = val.to_str() {
                    if sc_str.starts_with("__puus=") {
                        let puus_val = sc_str.split(';').next().unwrap_or("");
                        resp_headers.push((
                            header::HeaderName::from_static("x-append-cookie"),
                            puus_val.to_string(),
                        ));
                    }
                }
            }

            let status = StatusCode::from_u16(result.status).unwrap_or(StatusCode::OK);
            let mut response = (status, result.body.to_vec()).into_response();
            for (name, value) in resp_headers {
                if let Ok(v) = value.parse() {
                    response.headers_mut().insert(name, v);
                }
            }
            response
        }
        Err(e) => json_response(StatusCode::BAD_GATEWAY, json!({ "error": e })),
    }
}
