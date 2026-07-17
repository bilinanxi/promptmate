use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::ExtendedColorType;
use promptmate_lib::ai::{
    cancel_ai_request, complete_prompt_fields, credential_account, delete_ai_api_key,
    generate_prompt_from_image, generate_prompt_from_video, has_ai_api_key, list_ai_models,
    optimize_composed_prompt, parse_completion_content, parse_image_prompt_content,
    parse_model_ids, parse_optimized_prompt, parse_video_prompt_content, save_ai_api_key,
    test_ai_provider, validate_config, AiCompletionInput, AiOptimizedPrompt, AiProviderConfig,
    ImagePromptInput, VideoPromptFrameInput, VideoPromptInput,
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

fn valid_jpeg_base64(red: u8) -> String {
    let mut bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut bytes, 82)
        .encode(&[red, 64, 128], 1, 1, ExtendedColorType::Rgb8)
        .unwrap();
    BASE64.encode(bytes)
}

fn jpeg_with_metadata_base64(red: u8) -> String {
    let bytes = BASE64.decode(valid_jpeg_base64(red)).unwrap();
    let payload = b"Exif\0\0PromptMateMeta";
    let length = (payload.len() as u16 + 2).to_be_bytes();
    let mut with_metadata = Vec::with_capacity(bytes.len() + payload.len() + 4);
    with_metadata.extend_from_slice(&bytes[..2]);
    with_metadata.extend_from_slice(&[0xff, 0xe1, length[0], length[1]]);
    with_metadata.extend_from_slice(payload);
    with_metadata.extend_from_slice(&bytes[2..]);
    BASE64.encode(with_metadata)
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
    assert_eq!(
        parse_model_ids(
            br#"{"object":"list","data":[{"id":"MiniMax-M3","object":"model"},{"id":"MiniMax-M2.7"},{"id":"MiniMax-M3"}]}"#
        ),
        Ok(vec!["MiniMax-M3".into(), "MiniMax-M2.7".into()])
    );
    assert!(parse_model_ids(br#"{}"#).is_err());
    assert!(parse_model_ids(br#"{"data":{}}"#).is_err());
    assert!(parse_model_ids(br#"{"data":[{"id":""}]}"#).is_err());
    assert!(parse_model_ids(br#"{"data":[{"id":"bad\u0000model"}]}"#).is_err());
}

#[test]
fn lists_exact_provider_model_ids_without_requiring_a_preselected_model() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = r#"{"data":[{"id":"MiniMax-M3"},{"id":"MiniMax-M2.7"}]}"#;
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
    let mut provider = config(&format!("http://{address}/v1"));
    provider.model.clear();

    let result = tauri::async_runtime::block_on(list_ai_models(provider));
    let request = server.join().unwrap();

    assert_eq!(result, Ok(vec!["MiniMax-M3".into(), "MiniMax-M2.7".into()]));
    assert!(request.starts_with("GET /v1/models HTTP/1.1\r\n"));
}

#[cfg(target_os = "windows")]
#[test]
fn rejects_model_ids_that_reflect_the_bound_credential() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let credential = format!("model-reflection-test-{}", std::process::id());
    let body = serde_json::json!({
        "data": [{ "id": format!("unsafe-{credential}") }]
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
    let provider = config(&format!("http://{address}/v1"));
    let _ = delete_ai_api_key(provider.clone());
    assert_eq!(save_ai_api_key(provider.clone(), credential), Ok(()));

    let result = tauri::async_runtime::block_on(list_ai_models(provider.clone()));
    let cleanup = delete_ai_api_key(provider);
    server.join().unwrap();

    assert_eq!(cleanup, Ok(()));
    assert_eq!(result, Err("AI 服务返回了不安全的模型列表。".into()));
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
    assert!(parse_completion_content(&format!("```json\n{content}\n```")).is_ok());
    assert!(parse_completion_content(&format!("<think>reasoning</think>\n{content}")).is_ok());
    assert!(parse_completion_content(&format!("Here is the result: {content}")).is_err());

    let unknown = r#"{"description_zh":"a","description_en":"b","tags":[],"aliases_zh":[],"aliases_en":[],"extra":true}"#;
    assert!(parse_completion_content(unknown).is_err());
    assert!(parse_completion_content(&"x".repeat(65_537)).is_err());
}

#[test]
fn accepts_only_bounded_exact_bilingual_optimized_prompt_json() {
    let content = r#"{"zh":" 雨夜霓虹街道 ","en":" Neon-lit rainy street "}"#;
    assert_eq!(
        parse_optimized_prompt(content),
        Ok(AiOptimizedPrompt {
            zh: "雨夜霓虹街道".into(),
            en: "Neon-lit rainy street".into(),
        })
    );
    assert!(parse_optimized_prompt(&format!("```json\n{content}\n```")).is_ok());
    assert!(parse_optimized_prompt(&format!("<think>reasoning</think>\n{content}")).is_ok());
    assert!(parse_optimized_prompt(&format!("Result: {content}")).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"雨夜"}"#).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"雨夜","en":"Rain","extra":true}"#).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"","en":"Rain"}"#).is_err());
    assert!(parse_optimized_prompt(&"x".repeat(65_537)).is_err());
    assert!(parse_optimized_prompt(r#"{"zh":"safe\u0000unsafe","en":"Rain"}"#).is_err());
}

#[test]
fn image_prompts_use_a_tighter_bilingual_output_limit() {
    let valid = serde_json::json!({ "zh": "雨夜", "en": "Rainy night" }).to_string();
    assert!(parse_image_prompt_content(&valid).is_ok());
    let oversized = serde_json::json!({ "zh": "图".repeat(4_097), "en": "safe" }).to_string();
    assert_eq!(
        parse_image_prompt_content(&oversized),
        Err("AI 返回了无效的图片提示词。".into())
    );
}

#[test]
fn video_prompts_use_a_strict_tighter_bilingual_output_contract() {
    let valid = serde_json::json!({ "zh": "镜头推进", "en": "Camera pushes in" }).to_string();
    assert!(parse_video_prompt_content(&valid).is_ok());
    let oversized = serde_json::json!({ "zh": "镜".repeat(4_097), "en": "safe" }).to_string();
    assert_eq!(
        parse_video_prompt_content(&oversized),
        Err("AI 返回了无效的视频提示词。".into())
    );
    let extra = serde_json::json!({ "zh": "安全", "en": "safe", "audio": "guessed" }).to_string();
    assert_eq!(
        parse_video_prompt_content(&extra),
        Err("AI 返回了无效的视频提示词。".into())
    );
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

#[test]
fn generates_bilingual_prompts_from_a_bounded_image_contract() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = serde_json::json!({
        "choices": [{ "message": { "content": "{\"zh\":\"极简白色背景上的红色陶瓷杯，柔和侧光。\",\"en\":\"A red ceramic mug on a minimal white background, soft side lighting.\"}" } }]
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
    let image_base64 = "/9j/2Q==";

    let result = tauri::async_runtime::block_on(generate_prompt_from_image(
        config(&format!("http://{address}/v1")),
        ImagePromptInput {
            mime_type: "image/jpeg".into(),
            base64: image_base64.into(),
        },
        "balanced".into(),
        "image-contract".into(),
    ));
    let request = server.join().unwrap();

    assert_eq!(
        result,
        Ok(AiOptimizedPrompt {
            zh: "极简白色背景上的红色陶瓷杯，柔和侧光。".into(),
            en: "A red ceramic mug on a minimal white background, soft side lighting.".into(),
        })
    );
    assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"));
    assert!(request.contains(&format!("data:image/jpeg;base64,{image_base64}")));
    assert!(request.contains("image_url"));
    assert!(request.contains("\"max_tokens\":512"));
}

#[test]
fn generates_bilingual_video_prompts_from_ordered_bounded_frames() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = serde_json::json!({
        "choices": [{ "message": { "content": "{\"zh\":\"红色陶瓷杯从桌边滑向中央，镜头缓慢推进，柔和侧光。\",\"en\":\"A red ceramic mug slides from the table edge to the center as the camera slowly pushes in under soft side lighting.\"}" } }]
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
    let frames = [
        jpeg_with_metadata_base64(32),
        valid_jpeg_base64(128),
        valid_jpeg_base64(224),
    ];

    let result = tauri::async_runtime::block_on(generate_prompt_from_video(
        config(&format!("http://{address}/v1")),
        VideoPromptInput {
            duration_ms: 12_000,
            frames: frames
                .iter()
                .enumerate()
                .map(|(index, base64)| VideoPromptFrameInput {
                    timestamp_ms: 1_000 + index as u64 * 5_000,
                    mime_type: "image/jpeg".into(),
                    base64: base64.clone(),
                })
                .collect(),
        },
        "balanced".into(),
        "video-contract".into(),
    ));
    let request = server.join().unwrap();

    assert_eq!(
        result,
        Ok(AiOptimizedPrompt {
            zh: "红色陶瓷杯从桌边滑向中央，镜头缓慢推进，柔和侧光。".into(),
            en: "A red ceramic mug slides from the table edge to the center as the camera slowly pushes in under soft side lighting.".into(),
        })
    );
    assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"));
    assert_eq!(request.matches("data:image/jpeg;base64,").count(), 3);
    let request_body = request.split_once("\r\n\r\n").unwrap().1;
    let request_json: serde_json::Value = serde_json::from_str(request_body).unwrap();
    let sent_frames = request_json["messages"][1]["content"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|part| part["image_url"]["url"].as_str());
    for data_url in sent_frames {
        let bytes = BASE64
            .decode(data_url.strip_prefix("data:image/jpeg;base64,").unwrap())
            .unwrap();
        assert!(image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg).is_ok());
        assert!(!bytes.windows(4).any(|window| window == b"Exif"));
        assert!(!bytes
            .windows(b"PromptMateMeta".len())
            .any(|window| window == b"PromptMateMeta"));
    }
    assert_eq!(request.matches("\"type\":\"image_url\"").count(), 3);
    assert!(request.contains("chronological"));
    assert!(request.contains("camera movement"));
    assert!(request.contains("\"max_tokens\":700"));
}

#[test]
fn rejects_invalid_video_frame_contracts_before_network() {
    let provider = config("https://api.example.com/v1");
    let valid_frame = |timestamp_ms| VideoPromptFrameInput {
        timestamp_ms,
        mime_type: "image/jpeg".into(),
        base64: valid_jpeg_base64(128),
    };
    let cases = [
        (
            VideoPromptInput {
                duration_ms: 0,
                frames: vec![valid_frame(100), valid_frame(500)],
            },
            "video-zero-duration",
            "视频时长必须在 1 到 60 秒之间。",
        ),
        (
            VideoPromptInput {
                duration_ms: 60_001,
                frames: vec![valid_frame(100), valid_frame(500)],
            },
            "video-too-long",
            "视频时长必须在 1 到 60 秒之间。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![valid_frame(100)],
            },
            "video-too-few-frames",
            "视频必须包含 3 到 6 个有序时间采样帧。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: (0..7).map(|_| valid_frame(100)).collect(),
            },
            "video-too-many-frames",
            "视频必须包含 3 到 6 个有序时间采样帧。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![
                    valid_frame(100),
                    VideoPromptFrameInput {
                        timestamp_ms: 500,
                        mime_type: "image/png".into(),
                        base64: "/9j/2Q==".into(),
                    },
                    valid_frame(900),
                ],
            },
            "video-invalid-frame-type",
            "视频时间采样帧必须是已去除元数据的 JPEG 图片。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![
                    valid_frame(100),
                    VideoPromptFrameInput {
                        timestamp_ms: 500,
                        mime_type: "image/jpeg".into(),
                        base64: "/9j/2Q==".into(),
                    },
                    valid_frame(900),
                ],
            },
            "video-malformed-jpeg",
            "视频时间采样帧格式与文件内容不一致。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![
                    valid_frame(100),
                    VideoPromptFrameInput {
                        timestamp_ms: 500,
                        mime_type: "image/jpeg".into(),
                        base64: "/9j/".into(),
                    },
                    valid_frame(900),
                ],
            },
            "video-spoofed-frame",
            "视频时间采样帧格式与文件内容不一致。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![
                    valid_frame(100),
                    VideoPromptFrameInput {
                        timestamp_ms: 500,
                        mime_type: "image/jpeg".into(),
                        base64: "%%%%".into(),
                    },
                    valid_frame(900),
                ],
            },
            "video-invalid-base64",
            "视频时间采样帧数据无效。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![valid_frame(100), valid_frame(100), valid_frame(900)],
            },
            "video-unordered-timestamps",
            "视频时间采样帧时间戳必须严格递增且位于视频时长内。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![valid_frame(100), valid_frame(500), valid_frame(1_000)],
            },
            "video-out-of-range-timestamp",
            "视频时间采样帧时间戳必须严格递增且位于视频时长内。",
        ),
        (
            VideoPromptInput {
                duration_ms: 1_000,
                frames: vec![
                    valid_frame(100),
                    VideoPromptFrameInput {
                        timestamp_ms: 500,
                        mime_type: "image/jpeg".into(),
                        base64: "A".repeat(873_817),
                    },
                    valid_frame(900),
                ],
            },
            "video-frame-too-large",
            "视频时间采样帧为空或单帧超过 640 KiB。",
        ),
    ];

    for (input, request_id, expected) in cases {
        assert_eq!(
            tauri::async_runtime::block_on(generate_prompt_from_video(
                provider.clone(),
                input,
                "balanced".into(),
                request_id.into(),
            )),
            Err(expected.into())
        );
    }
}

#[test]
fn rejects_unsupported_spoofed_and_oversized_images_before_network() {
    let provider = config("https://api.example.com/v1");
    let invalid = [
        (
            ImagePromptInput {
                mime_type: "image/gif".into(),
                base64: "R0lGODlhAQABAAAAACw=".into(),
            },
            "image-invalid-type",
            "仅支持已去除元数据的 JPEG 图片。",
        ),
        (
            ImagePromptInput {
                mime_type: "image/jpeg".into(),
                base64: "/9j/".into(),
            },
            "image-spoofed-type",
            "图片格式与文件内容不一致。",
        ),
        (
            ImagePromptInput {
                mime_type: "image/jpeg".into(),
                base64: "A".repeat(6_990_509),
            },
            "image-too-large",
            "图片为空或超过 5 MiB。",
        ),
    ];

    for (input, request_id, expected) in invalid {
        assert_eq!(
            tauri::async_runtime::block_on(generate_prompt_from_image(
                provider.clone(),
                input,
                "balanced".into(),
                request_id.into(),
            )),
            Err(expected.into())
        );
    }
}

#[cfg(target_os = "windows")]
#[test]
fn rejects_image_prompt_responses_that_reflect_the_bound_credential() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let credential = format!("image-reflection-test-{}", std::process::id());
    let escaped_credential = credential
        .chars()
        .map(|character| format!("\\u{:04x}", character as u32))
        .collect::<String>();
    let body = serde_json::json!({
        "choices": [{
            "message": {
                "reasoning_content": credential,
                "content": "{\"zh\":\"安全图片提示词\",\"en\":\"Safe image prompt\"}"
            }
        }]
    })
    .to_string()
    .replace(&credential, &escaped_credential);
    assert!(!body.contains(&credential));
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
    assert_eq!(save_ai_api_key(endpoint.clone(), credential), Ok(()));

    let result = tauri::async_runtime::block_on(generate_prompt_from_image(
        endpoint.clone(),
        ImagePromptInput {
            mime_type: "image/jpeg".into(),
            base64: "/9j/2Q==".into(),
        },
        "balanced".into(),
        "image-reflection".into(),
    ));
    let cleanup = delete_ai_api_key(endpoint);
    server.join().unwrap();

    assert_eq!(cleanup, Ok(()));
    assert_eq!(result, Err("AI 服务返回了不安全的图片提示词。".into()));
}

#[cfg(target_os = "windows")]
#[test]
fn rejects_video_prompt_responses_that_reflect_the_bound_credential() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let credential = format!("video-reflection-test-{}", std::process::id());
    let escaped_credential = credential
        .chars()
        .map(|character| format!("\\u{:04x}", character as u32))
        .collect::<String>();
    let body = serde_json::json!({
        "choices": [{
            "message": {
                "reasoning_content": credential,
                "content": "{\"zh\":\"安全视频提示词\",\"en\":\"Safe video prompt\"}"
            }
        }]
    })
    .to_string()
    .replace(&credential, &escaped_credential);
    assert!(!body.contains(&credential));
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
    assert_eq!(save_ai_api_key(endpoint.clone(), credential), Ok(()));

    let result = tauri::async_runtime::block_on(generate_prompt_from_video(
        endpoint.clone(),
        VideoPromptInput {
            duration_ms: 3_000,
            frames: vec![
                VideoPromptFrameInput {
                    timestamp_ms: 500,
                    mime_type: "image/jpeg".into(),
                    base64: valid_jpeg_base64(32),
                },
                VideoPromptFrameInput {
                    timestamp_ms: 1_500,
                    mime_type: "image/jpeg".into(),
                    base64: valid_jpeg_base64(128),
                },
                VideoPromptFrameInput {
                    timestamp_ms: 2_500,
                    mime_type: "image/jpeg".into(),
                    base64: valid_jpeg_base64(224),
                },
            ],
        },
        "balanced".into(),
        "video-reflection".into(),
    ));
    let cleanup = delete_ai_api_key(endpoint);
    server.join().unwrap();

    assert_eq!(cleanup, Ok(()));
    assert_eq!(result, Err("AI 服务返回了不安全的视频提示词。".into()));
}

#[cfg(target_os = "windows")]
#[test]
fn stores_credentials_in_the_windows_vault_and_sends_them_only_to_the_bound_endpoint() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let body = r#"{"data":[{"id":"model-one"},{"id":"model-two"}]}"#;
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
        "description_en": "safe description",
        "tags": [],
        "aliases_zh": [],
        "aliases_en": []
    })
    .to_string();
    let wrapped = format!("<think>{credential}</think>\n{completion}");
    let body = serde_json::json!({
        "choices": [{ "message": { "content": wrapped } }]
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
    let optimized = serde_json::json!({
        "zh": "优化提示词",
        "en": "optimized prompt"
    })
    .to_string();
    let wrapped = format!("<think>{credential}</think>\n{optimized}");
    let body = serde_json::json!({
        "choices": [{ "message": { "content": wrapped } }]
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
