use std::time::Duration;

/// Trait defining the connector interface for publishing posts to social networks
pub trait PostPublisher: Send + Sync {
    fn publish(
        &self,
        platform: &str,
        account_name: &str,
        token: &str,
        content: &str,
        media_urls: &[String],
    ) -> impl std::future::Future<Output = Result<String, String>> + Send;
}

/// Real implementation of PostPublisher using reqwest with rustls
#[derive(Clone)]
pub struct RealPublisher {
    client: reqwest::Client,
    tg_base_url: Option<String>,
    vk_base_url: Option<String>,
}

impl RealPublisher {
    /// Create a new RealPublisher with official production endpoints
    /// Invariant: 10-second timeout strictly configured on reqwest::Client
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .expect("Failed to initialize reqwest Client with rustls");

        Self {
            client,
            tg_base_url: None,
            vk_base_url: None,
        }
    }

    /// Create RealPublisher with custom base URLs for testing and sandboxed environments
    pub fn with_endpoints(
        tg_base_url: Option<String>,
        vk_base_url: Option<String>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("Failed to initialize reqwest Client with rustls");

        Self {
            client,
            tg_base_url,
            vk_base_url,
        }
    }

    /// Parse Telegram JSON API response
    pub(crate) fn parse_telegram_response(
        status: reqwest::StatusCode,
        body_json: &serde_json::Value,
    ) -> Result<String, String> {
        // Extract error description if ok == false
        if let Some(ok) = body_json.get("ok").and_then(|v| v.as_bool()) {
            if !ok {
                let desc = body_json
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Telegram error");
                return Err(format!("Telegram API error: {}", desc));
            }
        } else if !status.is_success() {
            return Err(format!("Telegram API returned HTTP status {}", status.as_u16()));
        }

        // Extract message_id on success
        if let Some(message_id) = body_json
            .get("result")
            .and_then(|r| r.get("message_id"))
            .and_then(|m| m.as_i64())
        {
            Ok(format!("tg_{}", message_id))
        } else {
            Ok(format!("tg_published_{}", uuid::Uuid::new_v4()))
        }
    }

    /// Parse VKontakte JSON API response
    pub(crate) fn parse_vk_response(
        status: reqwest::StatusCode,
        body_json: &serde_json::Value,
    ) -> Result<String, String> {
        // Invariant: Check for logical "error" field in VK JSON response
        // VK returns HTTP 200 with {"error": {"error_code": 14, "error_msg": "Captcha needed", "request_params": [...]}}
        // CRITICAL INVARIANT: NEVER format or log error_obj or request_params as it leaks access_token!
        // Only extract error_code and error_msg.
        if let Some(error_obj) = body_json.get("error") {
            let code = error_obj
                .get("error_code")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let msg = error_obj
                .get("error_msg")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown VK error");
            return Err(format!("VK API error {}: {}", code, msg));
        }

        if !status.is_success() {
            return Err(format!("VK API returned HTTP status {}", status.as_u16()));
        }

        // Extract post_id on success
        if let Some(post_id) = body_json
            .get("response")
            .and_then(|r| r.get("post_id"))
            .and_then(|p| p.as_i64())
        {
            Ok(format!("vk_{}", post_id))
        } else {
            Ok(format!("vk_published_{}", uuid::Uuid::new_v4()))
        }
    }

    /// Internal Telegram publishing logic
    async fn publish_telegram(
        &self,
        account_name: &str,
        token: &str,
        content: &str,
    ) -> Result<String, String> {
        let base_url = self
            .tg_base_url
            .as_deref()
            .unwrap_or("https://api.telegram.org");
        let url = format!("{}/bot{}/sendMessage", base_url, token);

        let chat_id = normalize_telegram_chat_id(account_name);

        let payload = serde_json::json!({
            "chat_id": chat_id,
            "text": content,
        });

        // Invariant: Masking network errors (URL Redaction)
        // Never log or format the raw reqwest error, as it may contain the URL with bot token
        let resp = match self.client.post(&url).json(&payload).send().await {
            Ok(r) => r,
            Err(_) => {
                return Err("Network or API error occurred".to_string());
            }
        };

        let status = resp.status();
        let body_json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => {
                if !status.is_success() {
                    return Err(format!("Telegram API returned HTTP status {}", status.as_u16()));
                }
                return Err("Network or API error occurred".to_string());
            }
        };

        Self::parse_telegram_response(status, &body_json)
    }

    /// Internal VKontakte publishing logic
    async fn publish_vk(
        &self,
        token: &str,
        content: &str,
    ) -> Result<String, String> {
        let base_url = self
            .vk_base_url
            .as_deref()
            .unwrap_or("https://api.vk.com");
        let url = format!("{}/method/wall.post", base_url);

        let params = [
            ("access_token", token),
            ("v", "5.199"),
            ("message", content),
        ];

        // Invariant: POST form-urlencoded keeps token in body, not in URL query string
        // Invariant: Masking network errors without logging raw reqwest::Error
        let resp = match self.client.post(&url).form(&params).send().await {
            Ok(r) => r,
            Err(_) => {
                return Err("Network or API error occurred".to_string());
            }
        };

        let status = resp.status();
        let body_json: serde_json::Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => {
                if !status.is_success() {
                    return Err(format!("VK API returned HTTP status {}", status.as_u16()));
                }
                return Err("Network or API error occurred".to_string());
            }
        };

        Self::parse_vk_response(status, &body_json)
    }
}

/// Normalize Telegram chat_id / channel username.
/// Invariant: Telegram Bot API requires channel/supergroup usernames to start with '@'.
/// If the user inputs "NetGeniusAI" or "https://t.me/NetGeniusAI", normalize to "@NetGeniusAI".
/// Numeric IDs (e.g. -1001234567890 or 123456789) are preserved as-is.
pub fn normalize_telegram_chat_id(raw: &str) -> String {
    let mut cleaned = raw.trim();

    // Strip URL prefixes if provided
    for prefix in &[
        "https://t.me/",
        "http://t.me/",
        "t.me/",
        "https://telegram.me/",
        "http://telegram.me/",
        "telegram.me/",
    ] {
        if let Some(stripped) = cleaned.strip_prefix(prefix) {
            cleaned = stripped;
            break;
        }
    }

    // Strip trailing slashes or path segments (e.g. "NetGeniusAI/" -> "NetGeniusAI")
    cleaned = cleaned.trim_matches('/');

    // If it's already a numeric ID (e.g. -1001234567890 or 123456789), keep as is
    if cleaned.parse::<i64>().is_ok() {
        return cleaned.to_string();
    }

    // If it already starts with '@', return it
    if cleaned.starts_with('@') {
        return cleaned.to_string();
    }

    // Otherwise, prepend '@' for public channel/group usernames
    format!("@{}", cleaned)
}

impl Default for RealPublisher {
    fn default() -> Self {
        Self::new()
    }
}

impl PostPublisher for RealPublisher {
    async fn publish(
        &self,
        platform: &str,
        account_name: &str,
        token: &str,
        content: &str,
        _media_urls: &[String],
    ) -> Result<String, String> {
        let platform_norm = platform.trim().to_lowercase();
        match platform_norm.as_str() {
            "vk" => self.publish_vk(token, content).await,
            "tg" | "telegram" => self.publish_telegram(account_name, token, content).await,
            _ => Err("Unsupported platform".to_string()),
        }
    }
}

/// Mock implementation of the post publisher simulating network requests
pub struct MockPublisher {
    pub simulated_delay_ms: u64,
    pub should_fail: bool,
}

impl MockPublisher {
    pub fn new() -> Self {
        Self {
            simulated_delay_ms: 1000,
            should_fail: false,
        }
    }

    pub fn with_delay(delay_ms: u64) -> Self {
        Self {
            simulated_delay_ms: delay_ms,
            should_fail: false,
        }
    }

    pub fn failing() -> Self {
        Self {
            simulated_delay_ms: 50,
            should_fail: true,
        }
    }
}

impl Default for MockPublisher {
    fn default() -> Self {
        Self::new()
    }
}

impl PostPublisher for MockPublisher {
    async fn publish(
        &self,
        platform: &str,
        account_name: &str,
        _token: &str, // Invariant: Raw token is never logged or leaked
        content: &str,
        media_urls: &[String],
    ) -> Result<String, String> {
        println!(
            "[MockPublisher] Starting network request to '{}' for account '{}' (content_len: {}, media_count: {})",
            platform,
            account_name,
            content.len(),
            media_urls.len()
        );

        if self.simulated_delay_ms > 0 {
            tokio::time::sleep(Duration::from_millis(self.simulated_delay_ms)).await;
        }

        if self.should_fail {
            let err_msg = format!("Simulated network timeout/API error for '{}'", platform);
            eprintln!("[MockPublisher] Error: {}", err_msg);
            return Err(err_msg);
        }

        let post_id = format!("mock_{}_{}", platform, uuid::Uuid::new_v4());
        println!(
            "[MockPublisher] Successfully published post to '{}' ({}) -> external_id: {}",
            account_name, platform, post_id
        );

        Ok(post_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_unsupported_platform() {
        let publisher = RealPublisher::new();
        let res = publisher
            .publish("instagram", "insta_user", "tok123", "Hello IG", &[])
            .await;
        assert_eq!(res, Err("Unsupported platform".to_string()));

        let res_twitter = publisher
            .publish("twitter", "x_user", "tok456", "Hello X", &[])
            .await;
        assert_eq!(res_twitter, Err("Unsupported platform".to_string()));
    }

    #[tokio::test]
    async fn test_network_error_masking_redacts_token() {
        // Point to an invalid unreachable port
        let unreachable_url = "http://127.0.0.1:1".to_string();
        let publisher = RealPublisher::with_endpoints(
            Some(unreachable_url.clone()),
            Some(unreachable_url),
        );

        let secret_token = "SUPER_SECRET_TOKEN_DO_NOT_LEAK";

        // TG network error
        let tg_res = publisher
            .publish("tg", "@test_chat", secret_token, "Test message", &[])
            .await;
        assert!(tg_res.is_err());
        let tg_err = tg_res.unwrap_err();
        assert_eq!(tg_err, "Network or API error occurred");
        assert!(
            !tg_err.contains(secret_token),
            "Error must not leak secret token"
        );

        // VK network error
        let vk_res = publisher
            .publish("vk", "VK User", secret_token, "Test message", &[])
            .await;
        assert!(vk_res.is_err());
        let vk_err = vk_res.unwrap_err();
        assert_eq!(vk_err, "Network or API error occurred");
        assert!(
            !vk_err.contains(secret_token),
            "Error must not leak secret token"
        );
    }

    #[test]
    fn test_telegram_response_success() {
        let body: serde_json::Value = serde_json::json!({
            "ok": true,
            "result": {
                "message_id": 777
            }
        });

        let res = RealPublisher::parse_telegram_response(reqwest::StatusCode::OK, &body);
        assert_eq!(res, Ok("tg_777".to_string()));
    }

    #[test]
    fn test_telegram_response_api_error_redaction() {
        let body: serde_json::Value = serde_json::json!({
            "ok": false,
            "error_code": 400,
            "description": "Bad Request: chat not found"
        });

        let res = RealPublisher::parse_telegram_response(reqwest::StatusCode::BAD_REQUEST, &body);
        assert!(res.is_err());
        let err = res.unwrap_err();
        assert_eq!(err, "Telegram API error: Bad Request: chat not found");
    }

    #[test]
    fn test_vk_response_success() {
        let body: serde_json::Value = serde_json::json!({
            "response": {
                "post_id": 9999
            }
        });

        let res = RealPublisher::parse_vk_response(reqwest::StatusCode::OK, &body);
        assert_eq!(res, Ok("vk_9999".to_string()));
    }

    #[test]
    fn test_vk_response_api_error_redaction() {
        // VK returns HTTP 200 with error and request_params containing access_token
        let secret_token = "vk1.a.CRITICAL_SECRET_TOKEN_LEAK";
        let body: serde_json::Value = serde_json::json!({
            "error": {
                "error_code": 14,
                "error_msg": "Captcha needed",
                "request_params": [
                    {"key": "access_token", "value": secret_token},
                    {"key": "v", "value": "5.199"},
                    {"key": "message", "value": "Hello"}
                ]
            }
        });

        let res = RealPublisher::parse_vk_response(reqwest::StatusCode::OK, &body);
        assert!(res.is_err());
        let err = res.unwrap_err();

        // Must extract ONLY human-readable error reason
        assert_eq!(err, "VK API error 14: Captcha needed");
        // CRITICAL INVARIANT: Token must NOT be in error output
        assert!(
            !err.contains(secret_token),
            "VK error must NEVER leak access_token from request_params"
        );
        assert!(
            !err.contains("request_params"),
            "VK error must not dump request_params"
        );
    }

    #[test]
    fn test_normalize_telegram_chat_id() {
        assert_eq!(normalize_telegram_chat_id("NetGeniusAI"), "@NetGeniusAI");
        assert_eq!(normalize_telegram_chat_id("@NetGeniusAI"), "@NetGeniusAI");
        assert_eq!(normalize_telegram_chat_id("https://t.me/NetGeniusAI"), "@NetGeniusAI");
        assert_eq!(normalize_telegram_chat_id("http://t.me/NetGeniusAI/"), "@NetGeniusAI");
        assert_eq!(normalize_telegram_chat_id("t.me/NetGeniusAI"), "@NetGeniusAI");
        assert_eq!(normalize_telegram_chat_id("-1001234567890"), "-1001234567890");
        assert_eq!(normalize_telegram_chat_id("12345678"), "12345678");
        assert_eq!(normalize_telegram_chat_id("  NetGeniusAI  "), "@NetGeniusAI");
    }
}
