use promptmate_lib::ai::{
    cancel_ai_request, complete_prompt_fields, credential_account, delete_ai_api_key,
    has_ai_api_key, optimize_composed_prompt, parse_completion_content, parse_model_count,
    parse_optimized_prompt, save_ai_api_key, test_ai_provider, validate_config, AiCompletionInput,
    AiOptimizedPrompt, AiProviderConfig,
};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

fn config(base_url: &str) -> AiProviderConfig {
    AiProviderConfig {
        version: 1,
        kind: "openai-compatible".into(),
        base_url: base_url.into(),
        model: "example-model".into(),
    }
}

fn read_request(stream: &mut TcpStream) -> Vec<u8> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut request = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let count = stream.read(&mut chunk).unwrap();
        if count == 0 {
            break;
        }
        request.extend_from_slice(&chunk[..count]);
        let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") else {
            continue;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let content_length = headers
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())?
            })
            .unwrap_or(0);
        if request.len() >= header_end + 4 + content_length {
            break;
        }
    }
    request
}

#[test]
fn validates_transport_and_binds_credentials_to_the_exact_endpoint() {
    assert_eq!(
        validate_config(&config("http://api.example.com/v1")),
        Err("远程服务必须使用 HTTPS。".into())
    );
    assert_eq!(
        validate_config(&config("http://127.evil.example/v1")),
        Err("远程服务必须使用 HTTPS。".into())
    );
    assert_eq!(
        validate_config(&config("http://localhost:11434/v1")),
        Err("远程服务必须使用 HTTPS。".into())
    );
    assert!(validate_config(&config("http://127.0.0.1:11434/v1")).is_ok());
    let mut unconfigured = config("https://one.example/v1");
    unconfigured.model.clear();
    assert!(credential_account(&unconfigured).is_ok());
    assert!(validate_config(&unconfigured).is_err());
    assert_ne!(
        credential_account(&config("https://one.example/v1")).unwrap(),
        credential_account(&config("https://two.example/v1")).unwrap()
    );
}

#[test]
fn accepts_only_the_expected_model_listing_shape() {
    assert_eq!(parse_model_count(br#"{"data":[]}"#), Ok(0));
    assert!(parse_model_count(br#"{}"#).is_err());
    assert!(parse_model_count(br#"{"data":{}}"#).is_err());
}

#[test]
fn accepts_only_bounded_exact_completion_json() {
    let content = r#"{
      "description_zh":"雨夜人像",
      "description_en":"Rainy portrait",
      "tags":["雨夜","人像"],
      "aliases_zh":["夜雨人像"],
      "aliases_en":["rain portrait"]
    }"#;
    let suggestion = parse_completion_content(content).unwrap();
    assert_eq!(suggestion.tags, vec!["雨夜", "人像"]);

    let unknown = r#"{"description_zh":"a","description_en":"b","tags":[],"aliases_zh":[],"aliases_en":[],"extra":true}"#;
    assert!(parse_completion_content(unknown).is_err());
    assert!(parse_completion_content(&"x".repeat(65_537)).is_err());
}

#[test]
fn accepts_only_bounded_exact_bilingual_optimized_prompt_json() {
    assert_eq!(
        parse_optimized_prompt(r#"{"zh":" 雨夜霓虹街道 ","en":" Neon-lit rainy street "}"#),
        Ok(AiOptimizedPrompt {
            zh: "雨夜霓虹街道".into(),
            en: "Neon-lit rainy street".into(),
        })
    );
    assert!(parse_optimized_prompt(r#"{"zh":"雨夜"}"#).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"雨夜","en":"Rain","extra":true}"#).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"","en":"Rain"}"#).is_err());
    assert!(parse_optimized_prompt(&"x".repeat(65_537)).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"safe\u0000unsafe","en":"Rain"}"#).is_err());
}

#[test]
fn optimizes_a_composed_prompt_through_the_bounded_contract() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = serde_json::json!({
        "choices": [{ "message": { "content": "{\"zh\":\"电影感雨夜街道，中近景，霓虹反射。\",\"en\":\"Cinematic rainy street, medium close-up, neon reflections.\"}" } }]
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });

    let result = tauri::async_runtime::block_on(optimize_composed_prompt(
        config(&format!("http://{address}/v1")),
        "雨夜街道，中近景。".into(),
        "Rainy street, medium close-up.".into(),
        "balanced".into(),
        "basket-contract".into(),
    ));
    let request = server.join().unwrap();

    assert_eq!(
        result,
        Ok(AiOptimizedPrompt {
            zh: "电影感雨夜街道，中近景，霓虹反射。".into(),
            en: "Cinematic rainy street, medium close-up, neon reflections.".into(),
        })
    );
    assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"));
    assert!(request.contains("雨夜街道"));
    assert!(request.contains("Rainy street"));
    assert!(request.contains("\"max_tokens\":512"));
}

#[cfg(target_os = "windows")]
#[test]
fn stores_credentials_in_the_windows_vault_and_sends_them_only_to_the_bound_endpoint() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = r#"{"data":[{},{}]}"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(count) => {
                    request.extend_from_slice(&chunk[..count]);
                    if request.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == std::io::ErrorKind::TimedOut => break,
                Err(error) => panic!("server read failed: {error}"),
            }
        }
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });

    let endpoint = config(&format!("http://{address}/v1"));
    let key = format!("promptmate-test-{}", std::process::id());
    let _ = delete_ai_api_key(endpoint.clone());
    let saved = save_ai_api_key(endpoint.clone(), key.clone());
    let existed = has_ai_api_key(endpoint.clone());

    let result = tauri::async_runtime::block_on(test_ai_provider(endpoint.clone()));
    let cleanup = delete_ai_api_key(endpoint.clone());
    let absent_after_cleanup = has_ai_api_key(endpoint);
    let request = server.join().unwrap();

    assert_eq!(saved, Ok(()));
    assert_eq!(existed, Ok(true));
    assert_eq!(cleanup, Ok(()));
    assert_eq!(absent_after_cleanup, Ok(false));
    assert_eq!(result, Ok("连接成功，服务返回 2 个模型。".into()));
    assert!(request.starts_with("GET /v1/models HTTP/1.1\r\n"));
    assert!(request.contains(&format!("authorization: Bearer {key}")));
}

#[test]
fn completes_fields_through_the_bounded_openai_compatible_contract() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let completion = serde_json::json!({
        "description_zh": "雨夜人像",
        "description_en": "Rainy portrait",
        "tags": ["雨夜"],
        "aliases_zh": [],
        "aliases_en": []
    })
    .to_string();
    let body = serde_json::json!({
        "choices": [{ "message": { "content": completion } }]
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let request = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });

    let input = AiCompletionInput {
        zh: "雨夜人像".into(),
        en: "Rainy night portrait".into(),
        category_id: "people-subjects".into(),
        media_type: "image".into(),
        description_zh: String::new(),
        description_en: String::new(),
        tags: vec![],
        aliases_zh: vec![],
        aliases_en: vec![],
    };
    let result = tauri::async_runtime::block_on(complete_prompt_fields(
        config(&format!("http://{address}/v1")),
        input,
        "balanced".into(),
        "completion-contract".into(),
    ));
    let request = server.join().unwrap();

    assert_eq!(result.unwrap().description_en, "Rainy portrait");
    assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"));
    assert!(request.contains("\"model\":\"example-model\""));
    assert!(request.contains("\\\"categoryId\\\":\\\"people-subjects\\\""));
}

#[cfg(target_os = "windows")]
#[test]
fn rejects_provider_responses_that_reflect_the_bound_credential() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let credential = format!("reflection-test-{}", std::process::id());
    let completion = serde_json::json!({
        "description_zh": "安全描述",
        "description_en": credential,
        "tags": [],
        "aliases_zh": [],
        "aliases_en": []
    })
    .to_string();
    let body = serde_json::json!({
        "choices": [{ "message": { "content": completion } }]
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let _ = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
    });
    let endpoint = config(&format!("http://{address}/v1"));
    let _ = delete_ai_api_key(endpoint.clone());
    let saved = save_ai_api_key(endpoint.clone(), credential);
    let input = AiCompletionInput {
        zh: "雨夜人像".into(),
        en: "Rainy night portrait".into(),
        category_id: "people-subjects".into(),
        media_type: "image".into(),
        description_zh: String::new(),
        description_en: String::new(),
        tags: vec![],
        aliases_zh: vec![],
        aliases_en: vec![],
    };

    let result = tauri::async_runtime::block_on(complete_prompt_fields(
        endpoint.clone(),
        input,
        "balanced".into(),
        "credential-reflection-test".into(),
    ));
    let cleanup = delete_ai_api_key(endpoint);
    server.join().unwrap();

    assert_eq!(saved, Ok(()));
    assert_eq!(cleanup, Ok(()));
    assert_eq!(
        result.err().as_deref(),
        Some("AI 服务返回了不安全的补全内容。")
    );
}

#[cfg(target_os = "windows")]
#[test]
fn rejects_optimized_prompts_that_reflect_the_bound_credential() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let credential = format!("optimization-reflection-test-{}", std::process::id());
    let body = serde_json::json!({
        "choices": [{ "message": { "content": serde_json::json!({
            "zh": format!("优化 {credential}"),
            "en": "optimized prompt"
        }).to_string() } }]
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let _ = read_request(&mut stream);
        stream.write_all(response.as_bytes()).unwrap();
    });
    let endpoint = config(&format!("http://{address}/v1"));
    let _ = delete_ai_api_key(endpoint.clone());
    let saved = save_ai_api_key(endpoint.clone(), credential);

    let result = tauri::async_runtime::block_on(optimize_composed_prompt(
        endpoint.clone(),
        "雨夜街道".into(),
        "Rainy street".into(),
        "balanced".into(),
        "optimization-reflection".into(),
    ));
    let cleanup = delete_ai_api_key(endpoint);
    server.join().unwrap();

    assert_eq!(saved, Ok(()));
    assert_eq!(cleanup, Ok(()));
    assert_eq!(
        result.err().as_deref(),
        Some("AI 服务返回了不安全的优化内容。")
    );
}

#[test]
fn cancels_an_active_native_completion_request() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (accepted_tx, accepted_rx) = std::sync::mpsc::channel();
    let server = thread::spawn(move || {
        let (_stream, _) = listener.accept().unwrap();
        accepted_tx.send(()).unwrap();
        thread::sleep(Duration::from_secs(1));
    });
    let request_id = format!("cancel-test-{}", std::process::id());
    let cancel_id = request_id.clone();
    let canceller = thread::spawn(move || {
        accepted_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        cancel_ai_request(cancel_id).unwrap();
    });
    let input = AiCompletionInput {
        zh: "雨夜人像".into(),
        en: "Rainy night portrait".into(),
        category_id: "people-subjects".into(),
        media_type: "image".into(),
        description_zh: String::new(),
        description_en: String::new(),
        tags: vec![],
        aliases_zh: vec![],
        aliases_en: vec![],
    };

    let result = tauri::async_runtime::block_on(complete_prompt_fields(
        config(&format!("http://{address}/v1")),
        input,
        "balanced".into(),
        request_id,
    ));

    canceller.join().unwrap();
    server.join().unwrap();
    assert_eq!(result.err().as_deref(), Some("AI 请求已取消。"));
}
