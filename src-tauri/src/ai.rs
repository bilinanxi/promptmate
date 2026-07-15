use futures_util::StreamExt;
use keyring::Entry;
use reqwest::{redirect::Policy, Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::oneshot;
use url::{Host, Url};

const CREDENTIAL_SERVICE: &str = "PromptMate AI";
const MAX_RESPONSE_BYTES: usize = 1_048_576;
const MAX_COMPLETION_BYTES: usize = 65_536;
const MAX_ACTIVE_REQUESTS: usize = 8;
const MAX_PENDING_CANCELLATIONS: usize = 32;

#[derive(Default)]
struct RequestRegistry {
    active: HashMap<String, ActiveRequest>,
    pending_cancellations: VecDeque<String>,
    next_generation: u64,
}

struct ActiveRequest {
    generation: u64,
    sender: oneshot::Sender<()>,
}

static REQUEST_REGISTRY: OnceLock<Mutex<RequestRegistry>> = OnceLock::new();

fn request_registry() -> &'static Mutex<RequestRegistry> {
    REQUEST_REGISTRY.get_or_init(|| Mutex::new(RequestRegistry::default()))
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiProviderConfig {
    pub version: u8,
    pub kind: String,
    pub base_url: String,
    pub model: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCompletionInput {
    pub zh: String,
    pub en: String,
    pub category_id: String,
    pub media_type: String,
    pub description_zh: String,
    pub description_en: String,
    pub tags: Vec<String>,
    pub aliases_zh: Vec<String>,
    pub aliases_en: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AiFieldSuggestion {
    pub description_zh: String,
    pub description_en: String,
    pub tags: Vec<String>,
    pub aliases_zh: Vec<String>,
    pub aliases_en: Vec<String>,
}

fn is_kind(value: &str) -> bool {
    matches!(value, "openai-compatible" | "ollama" | "lm-studio")
}

fn is_loopback(url: &Url) -> bool {
    match url.host() {
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        Some(Host::Domain(_)) | None => false,
    }
}

fn validate_endpoint(config: &AiProviderConfig) -> Result<Url, String> {
    if config.version != 1 || !is_kind(&config.kind) {
        return Err("AI 服务配置版本或类型无效。".into());
    }
    if config.base_url.len() > 2048 {
        return Err("AI 服务地址无效。".into());
    }
    let url = Url::parse(&config.base_url).map_err(|_| "服务地址不是有效 URL。")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("服务地址仅支持 HTTP 或 HTTPS。".into());
    }
    if url.host().is_none() {
        return Err("服务地址必须包含主机名。".into());
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("服务地址不能包含凭据、查询或片段。".into());
    }
    if url.scheme() == "http" && !is_loopback(&url) {
        return Err("远程服务必须使用 HTTPS。".into());
    }
    Ok(url)
}

pub fn validate_config(config: &AiProviderConfig) -> Result<Url, String> {
    let url = validate_endpoint(config)?;
    if config.model.trim().is_empty()
        || config.model.len() > 200
        || config.model.chars().any(char::is_control)
    {
        return Err("模型名称无效。".into());
    }
    Ok(url)
}

pub fn credential_account(config: &AiProviderConfig) -> Result<String, String> {
    let url = validate_endpoint(config)?;
    Ok(format!(
        "{}|{}",
        config.kind,
        url.as_str().trim_end_matches('/')
    ))
}

fn entry(config: &AiProviderConfig) -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, &credential_account(config)?)
        .map_err(|_| "无法访问 Windows 凭据管理器。".into())
}

#[tauri::command]
pub fn save_ai_api_key(config: AiProviderConfig, api_key: String) -> Result<(), String> {
    if api_key.is_empty() || api_key.len() > 4096 {
        return Err("API Key 长度无效。".into());
    }
    entry(&config)?
        .set_password(&api_key)
        .map_err(|_| "API Key 未能保存到 Windows 凭据管理器。".into())
}

#[tauri::command]
pub fn delete_ai_api_key(config: AiProviderConfig) -> Result<(), String> {
    match entry(&config)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("API Key 未能从 Windows 凭据管理器删除。".into()),
    }
}

#[tauri::command]
pub fn has_ai_api_key(config: AiProviderConfig) -> Result<bool, String> {
    match entry(&config)?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(_) => Err("无法读取 Windows 凭据管理器状态。".into()),
    }
}

fn api_key(config: &AiProviderConfig, url: &Url) -> Result<Option<String>, String> {
    match entry(config)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) if is_loopback(url) => Ok(None),
        Err(keyring::Error::NoEntry) => Err("当前远程服务尚未保存 API Key。".into()),
        Err(_) => Err("无法读取 Windows 凭据管理器。".into()),
    }
}

fn endpoint(base: &Url, path: &str) -> Result<Url, String> {
    let mut value = base.as_str().trim_end_matches('/').to_owned();
    value.push('/');
    value.push_str(path);
    Url::parse(&value).map_err(|_| "AI 服务地址无效。".into())
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .redirect(Policy::none())
        .build()
        .map_err(|_| "无法初始化 AI 网络客户端。".into())
}

async fn bounded_body(response: Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("AI 服务响应过大。".into());
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "读取 AI 服务响应失败。")?;
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err("AI 服务响应过大。".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

fn authorized(request: reqwest::RequestBuilder, key: Option<&str>) -> reqwest::RequestBuilder {
    match key {
        Some(value) => request.bearer_auth(value),
        None => request,
    }
}

pub fn parse_model_count(body: &[u8]) -> Result<usize, String> {
    let value: Value = serde_json::from_slice(body).map_err(|_| "AI 服务返回了无效 JSON。")?;
    value
        .get("data")
        .and_then(Value::as_array)
        .map(Vec::len)
        .ok_or_else(|| "AI 服务返回了无效的模型列表。".to_string())
}

#[tauri::command]
pub async fn test_ai_provider(config: AiProviderConfig) -> Result<String, String> {
    let base = validate_config(&config)?;
    let key = api_key(&config, &base)?;
    let response = authorized(client()?.get(endpoint(&base, "models")?), key.as_deref())
        .send()
        .await
        .map_err(|_| "无法连接 AI 服务。".to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("AI 服务返回 HTTP {}。", status.as_u16()));
    }
    let body = bounded_body(response).await?;
    let count = parse_model_count(&body)?;
    Ok(format!("连接成功，服务返回 {count} 个模型。"))
}

fn validate_input(input: &AiCompletionInput) -> Result<(), String> {
    let serialized = serde_json::to_vec(input).map_err(|_| "AI 补全输入无效。")?;
    if serialized.len() > 32_768
        || input.zh.trim().is_empty()
        || input.en.trim().is_empty()
        || input.category_id.trim().is_empty()
        || !matches!(input.media_type.as_str(), "image" | "video")
    {
        return Err("AI 补全输入无效或过大。".into());
    }
    Ok(())
}

fn temperature(mode: &str) -> Result<f32, String> {
    match mode {
        "faithful" => Ok(0.2),
        "balanced" => Ok(0.6),
        "creative" => Ok(0.9),
        _ => Err("AI 创意档位无效。".into()),
    }
}

fn normalize_list(values: &mut Vec<String>) -> Result<(), String> {
    if values.len() > 32 {
        return Err("AI 返回的列表项目过多。".into());
    }
    for value in values.iter_mut() {
        *value = value.trim().to_owned();
        if value.is_empty() || value.chars().count() > 100 {
            return Err("AI 返回了无效的列表项目。".into());
        }
    }
    let mut seen = HashSet::new();
    values.retain(|value| seen.insert(value.clone()));
    Ok(())
}

pub fn parse_completion_content(content: &str) -> Result<AiFieldSuggestion, String> {
    if content.len() > MAX_COMPLETION_BYTES {
        return Err("AI 补全结果过大。".into());
    }
    let mut value: AiFieldSuggestion =
        serde_json::from_str(content).map_err(|_| "AI 未返回严格的补全 JSON。")?;
    value.description_zh = value.description_zh.trim().to_owned();
    value.description_en = value.description_en.trim().to_owned();
    if value.description_zh.chars().count() > 2000 || value.description_en.chars().count() > 2000 {
        return Err("AI 返回的描述过长。".into());
    }
    normalize_list(&mut value.tags)?;
    normalize_list(&mut value.aliases_zh)?;
    normalize_list(&mut value.aliases_en)?;
    Ok(value)
}

fn suggestion_contains_secret(suggestion: &AiFieldSuggestion, secret: Option<&str>) -> bool {
    let Some(secret) = secret.filter(|value| !value.is_empty()) else {
        return false;
    };
    suggestion.description_zh.contains(secret)
        || suggestion.description_en.contains(secret)
        || suggestion.tags.iter().any(|value| value.contains(secret))
        || suggestion
            .aliases_zh
            .iter()
            .any(|value| value.contains(secret))
        || suggestion
            .aliases_en
            .iter()
            .any(|value| value.contains(secret))
}

async fn perform_completion(
    config: AiProviderConfig,
    input: AiCompletionInput,
    mode: String,
) -> Result<AiFieldSuggestion, String> {
    validate_input(&input)?;
    let base = validate_config(&config)?;
    let key = api_key(&config, &base)?;
    let user_content = serde_json::to_string(&input).map_err(|_| "AI 补全输入无效。")?;
    let request = json!({
        "model": config.model,
        "temperature": temperature(&mode)?,
        "messages": [
            {
                "role": "system",
                "content": "You complete PromptMate metadata. Return only one strict JSON object with exactly description_zh, description_en, tags, aliases_zh, aliases_en. Preserve the user's meaning, do not add markdown, and use arrays of unique non-empty strings. Existing values are context, not permission to overwrite them."
            },
            { "role": "user", "content": user_content }
        ]
    });
    let response = authorized(
        client()?
            .post(endpoint(&base, "chat/completions")?)
            .json(&request),
        key.as_deref(),
    )
    .send()
    .await
    .map_err(|_| "AI 补全请求失败。".to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("AI 服务返回 HTTP {}。", status.as_u16()));
    }
    let body = bounded_body(response).await?;
    let value: Value = serde_json::from_slice(&body).map_err(|_| "AI 服务返回了无效 JSON。")?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "AI 服务响应缺少补全内容。".to_string())?;
    let suggestion = parse_completion_content(content)?;
    if suggestion_contains_secret(&suggestion, key.as_deref()) {
        return Err("AI 服务返回了不安全的补全内容。".into());
    }
    Ok(suggestion)
}

fn valid_request_id(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 100
        && request_id
            .bytes()
            .all(|value| value.is_ascii_alphanumeric() || value == b'-')
}

struct RegisteredRequest {
    receiver: oneshot::Receiver<()>,
    generation: u64,
}

fn register_request(request_id: &str) -> Result<RegisteredRequest, String> {
    if !valid_request_id(request_id) {
        return Err("AI 请求标识无效。".into());
    }
    let mut registry = request_registry()
        .lock()
        .map_err(|_| "AI 请求管理器不可用。")?;
    if let Some(position) = registry
        .pending_cancellations
        .iter()
        .position(|value| value == request_id)
    {
        registry.pending_cancellations.remove(position);
        return Err("AI 请求已取消。".into());
    }
    if registry.active.len() >= MAX_ACTIVE_REQUESTS {
        return Err("同时进行的 AI 请求过多。".into());
    }
    if registry.active.contains_key(request_id) {
        return Err("AI 请求标识重复。".into());
    }
    let (sender, receiver) = oneshot::channel();
    registry.next_generation = registry.next_generation.wrapping_add(1).max(1);
    let generation = registry.next_generation;
    registry
        .active
        .insert(request_id.to_owned(), ActiveRequest { generation, sender });
    Ok(RegisteredRequest {
        receiver,
        generation,
    })
}

struct RequestGuard {
    request_id: String,
    generation: u64,
}

impl RequestGuard {
    fn new(request_id: String, generation: u64) -> Self {
        Self {
            request_id,
            generation,
        }
    }
}

impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Ok(mut registry) = request_registry().lock() {
            let owns_entry = registry
                .active
                .get(&self.request_id)
                .is_some_and(|entry| entry.generation == self.generation);
            if owns_entry {
                registry.active.remove(&self.request_id);
            }
        }
    }
}

#[tauri::command]
pub fn cancel_ai_request(request_id: String) -> Result<(), String> {
    if !valid_request_id(&request_id) {
        return Err("AI 请求标识无效。".into());
    }
    let sender = {
        let mut registry = request_registry()
            .lock()
            .map_err(|_| "AI 请求管理器不可用。")?;
        let sender = registry
            .active
            .remove(&request_id)
            .map(|entry| entry.sender);
        if sender.is_none() && !registry.pending_cancellations.contains(&request_id) {
            if registry.pending_cancellations.len() >= MAX_PENDING_CANCELLATIONS {
                registry.pending_cancellations.pop_front();
            }
            registry.pending_cancellations.push_back(request_id);
        }
        sender
    };
    if let Some(sender) = sender {
        let _ = sender.send(());
    }
    Ok(())
}

#[tauri::command]
pub async fn complete_prompt_fields(
    config: AiProviderConfig,
    input: AiCompletionInput,
    mode: String,
    request_id: String,
) -> Result<AiFieldSuggestion, String> {
    let registered = register_request(&request_id)?;
    let _guard = RequestGuard::new(request_id, registered.generation);
    tokio::select! {
        result = perform_completion(config, input, mode) => result,
        _ = registered.receiver => Err("AI 请求已取消。".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        cancel_ai_request, register_request, suggestion_contains_secret, AiFieldSuggestion,
        RequestGuard,
    };
    use tokio::sync::oneshot::error::TryRecvError;

    #[test]
    fn duplicate_request_ids_do_not_replace_the_active_cancellation_channel() {
        let request_id = "duplicate-request-test";
        let _ = cancel_ai_request(request_id.into());
        let _ = register_request(request_id);
        let mut registered = register_request(request_id).unwrap();

        assert_eq!(
            register_request(request_id).err().as_deref(),
            Some("AI 请求标识重复。")
        );
        assert_eq!(registered.receiver.try_recv(), Err(TryRecvError::Empty));
        cancel_ai_request(request_id.into()).unwrap();
        assert_eq!(tauri::async_runtime::block_on(registered.receiver), Ok(()));
    }

    #[test]
    fn cancellation_before_registration_is_consumed_once() {
        let request_id = "cancel-before-register-test";
        let _ = cancel_ai_request(request_id.into());

        assert_eq!(
            register_request(request_id).err().as_deref(),
            Some("AI 请求已取消。")
        );
        let registered = register_request(request_id).unwrap();
        cancel_ai_request(request_id.into()).unwrap();
        assert_eq!(tauri::async_runtime::block_on(registered.receiver), Ok(()));
    }

    #[test]
    fn request_guard_releases_an_abandoned_active_slot() {
        let request_id = "abandoned-request-test";
        let _ = cancel_ai_request(request_id.into());
        assert_eq!(
            register_request(request_id).err().as_deref(),
            Some("AI 请求已取消。")
        );
        let registered = register_request(request_id).unwrap();
        let guard = RequestGuard::new(request_id.into(), registered.generation);
        drop(registered.receiver);
        drop(guard);

        let registered = register_request(request_id).unwrap();
        cancel_ai_request(request_id.into()).unwrap();
        assert_eq!(tauri::async_runtime::block_on(registered.receiver), Ok(()));
    }

    #[test]
    fn stale_guard_does_not_remove_a_reused_request_id() {
        let request_id = "reused-request-test";
        let _ = cancel_ai_request(request_id.into());
        let _ = register_request(request_id);
        let first = register_request(request_id).unwrap();
        let first_guard = RequestGuard::new(request_id.into(), first.generation);
        cancel_ai_request(request_id.into()).unwrap();
        assert_eq!(tauri::async_runtime::block_on(first.receiver), Ok(()));

        let second = register_request(request_id).unwrap();
        let second_guard = RequestGuard::new(request_id.into(), second.generation);
        drop(first_guard);
        cancel_ai_request(request_id.into()).unwrap();

        assert_eq!(tauri::async_runtime::block_on(second.receiver), Ok(()));
        drop(second_guard);
    }

    #[test]
    fn detects_a_credential_reflected_in_any_suggestion_field() {
        let credential = ["test", "credential", "value"].join("-");
        let suggestion = AiFieldSuggestion {
            description_zh: "安全描述".into(),
            description_en: credential.clone(),
            tags: vec![],
            aliases_zh: vec![],
            aliases_en: vec![],
        };

        assert!(suggestion_contains_secret(&suggestion, Some(&credential)));
        assert!(!suggestion_contains_secret(&suggestion, None));
    }
}
