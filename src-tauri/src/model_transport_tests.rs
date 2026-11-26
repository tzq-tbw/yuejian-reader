use super::{model_chat, ModelChatInput, ModelMessage};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

fn input(base_url: String, key: &str) -> ModelChatInput {
    ModelChatInput {
        base_url,
        api_key: key.into(),
        model: "fixture".into(),
        messages: vec![ModelMessage {
            role: "user".into(),
            content: "example".into(),
        }],
        temperature: None,
        max_tokens: None,
        timeout_ms: Some(1_000),
    }
}

// One real HTTP exchange on loopback. The stub records the wire headers for assertions.
fn serve(status: &str, body: &str) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let base = format!("http://{}/v1", listener.local_addr().unwrap());
    let reply = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut reader = BufReader::new(&stream);
        let mut headers = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).unwrap() > 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
            headers.push_str(&line);
        }
        let mut request = vec![0; length];
        reader.read_exact(&mut request).unwrap();
        let json: serde_json::Value = serde_json::from_slice(&request).unwrap();
        assert_eq!(json["model"], "fixture");
        assert_eq!(json["stream"], false);
        stream.write_all(reply.as_bytes()).unwrap();
        headers
    });
    (base, server)
}

#[test]
fn request_headers_and_successful_json() {
    for key in ["", "local-test-value"] {
        let (url, server) = serve("200 OK", r#"{"fixture":true}"#);
        let result = tauri::async_runtime::block_on(model_chat(input(url, key))).unwrap();
        assert_eq!(result["fixture"], true);
        let headers = server.join().unwrap();
        assert!(headers.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"));
        let lower = headers.to_ascii_lowercase();
        let auth = lower
            .lines()
            .find(|line| line.starts_with("authorization:"));
        if key.is_empty() {
            assert_eq!(auth, None);
        } else {
            assert_eq!(auth, Some("authorization: bearer local-test-value"));
        }
    }
}

#[test]
fn maps_status_and_invalid_json() {
    let detail = "错".repeat(650);
    let (url, server) = serve("429 Too Many Requests", &detail);
    let error = tauri::async_runtime::block_on(model_chat(input(url, ""))).unwrap_err();
    assert_eq!(error, format!("模型服务返回 429：{}", "错".repeat(600)));
    server.join().unwrap();

    let (url, server) = serve("200 OK", "<html>bad gateway</html>");
    let error = tauri::async_runtime::block_on(model_chat(input(url, ""))).unwrap_err();
    assert_eq!(error, "模型服务返回的内容不是有效 JSON");
    server.join().unwrap();
}

#[test]
fn maps_response_timeout_and_connection_refusal() {
    // The listening socket accepts a connection into its backlog but never sends a reply.
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let url = format!("http://{}/v1", listener.local_addr().unwrap());
    let error = tauri::async_runtime::block_on(model_chat(input(url.clone(), ""))).unwrap_err();
    assert!(error.contains("超时"), "{error}");
    drop(listener);
    // Windows may retry a refused loopback connection before reporting refusal.
    let mut refusal = input(url, "");
    refusal.timeout_ms = Some(8_000);
    let error = tauri::async_runtime::block_on(model_chat(refusal)).unwrap_err();
    assert!(error.contains("无法连接"), "{error}");
}
