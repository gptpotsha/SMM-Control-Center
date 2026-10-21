pub mod commands;
pub mod crypto;
pub mod db;
pub mod models;
pub mod publisher;
pub mod scheduler;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Define migrations for tauri-plugin-sql
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: db::MIGRATION_01_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_destinations_status_and_logs",
            sql: db::MIGRATION_02_SQL,
            kind: MigrationKind::Up,
        },
    ];

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:smm_local.db", migrations)
                .build(),
        )
        .setup(|app| {
            // Invariant: Database must reside in app_data_dir
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app_data_dir: {}", e))?;

            // Initialize database pool with foreign keys and WAL mode
            let pool = tauri::async_runtime::block_on(async {
                db::init_db(&app_data_dir).await
            })
            .map_err(|e| format!("Database initialization failed: {}", e))?;

            // Invariant: Start background scheduler worker non-blocking via tokio::spawn
            scheduler::start_worker(pool.clone());

            // Manage DbState for Tauri commands
            app.manage(db::DbState { pool });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_account,
            commands::get_accounts,
            commands::get_account_by_id,
            commands::delete_account,
            commands::create_post,
            commands::get_posts,
            commands::delete_post,
            commands::retry_post
        ]);

    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    #[cfg(not(debug_assertions))]
    {
        context.config_mut().build.dev_url = None;
    }

    builder
        .run(context)
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use models::{CreateAccountInput, CreatePostInput};
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_init_db_and_foreign_keys_enabled() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        // Verify foreign_keys pragma is ON
        let fk_enabled: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .expect("Failed to query PRAGMA foreign_keys");
        assert_eq!(fk_enabled, 1, "PRAGMA foreign_keys must be ON");
    }

    #[tokio::test]
    async fn test_accounts_crud_and_cascade_delete() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        // 1. Create account
        let acc_input = CreateAccountInput {
            id: None,
            platform: "vk".to_string(),
            name: "VK Community".to_string(),
            encrypted_token: "encrypted_token_sample".to_string(),
            created_at: None,
        };
        let created_acc = db::create_account(&pool, acc_input)
            .await
            .expect("Failed to create account");
        assert_eq!(created_acc.platform, "vk");
        assert_eq!(created_acc.name, "VK Community");

        // 2. Fetch accounts
        let accounts = db::get_accounts(&pool).await.expect("Failed to fetch accounts");
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].id, created_acc.id);

        // 3. Create post targeting this account
        let post_input = CreatePostInput {
            id: None,
            content: "Hello World Post".to_string(),
            media_urls: Some(vec!["https://example.com/img.png".to_string()]),
            status: Some("draft".to_string()),
            scheduled_for: None,
            created_at: None,
            destination_account_ids: Some(vec![created_acc.id.clone()]),
        };
        let created_post = db::create_post(&pool, post_input)
            .await
            .expect("Failed to create post");
        assert_eq!(created_post.destination_account_ids.len(), 1);

        // Verify destination exists in post_destinations
        let count_dest: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM post_destinations WHERE post_id = ? AND account_id = ?"
        )
        .bind(&created_post.id)
        .bind(&created_acc.id)
        .fetch_one(&pool)
        .await
        .expect("Query failed");
        assert_eq!(count_dest, 1);

        // 4. Invariant test: Delete account -> Cascade delete in post_destinations
        let deleted = db::delete_account(&pool, &created_acc.id)
            .await
            .expect("Failed to delete account");
        assert!(deleted);

        // Verify destination was deleted by CASCADE
        let count_dest_after: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM post_destinations WHERE account_id = ?"
        )
        .bind(&created_acc.id)
        .fetch_one(&pool)
        .await
        .expect("Query failed");
        assert_eq!(count_dest_after, 0, "Record in post_destinations should be cascaded on account deletion");

        // The post itself still exists
        let posts = db::get_posts(&pool).await.expect("Failed to get posts");
        assert_eq!(posts.len(), 1);
        assert_eq!(posts[0].destination_account_ids.len(), 0);
    }

    #[tokio::test]
    async fn test_foreign_key_constraint_violation() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        let fake_account_id = uuid::Uuid::new_v4().to_string();
        let post_input = CreatePostInput {
            id: None,
            content: "Post for non-existent account".to_string(),
            media_urls: None,
            status: Some("draft".to_string()),
            scheduled_for: None,
            created_at: None,
            destination_account_ids: Some(vec![fake_account_id]),
        };

        // Should fail due to foreign key violation
        let res = db::create_post(&pool, post_input).await;
        assert!(res.is_err(), "Must fail when destination account doesn't exist");
    }

    #[test]
    fn test_frontend_isolation_token_omitted_from_serialization() {
        let account = models::Account {
            id: "12345678-1234-1234-1234-123456789abc".to_string(),
            platform: "vk".to_string(),
            name: "VK Group".to_string(),
            encrypted_token: "super_secret_encrypted_payload".to_string(),
            created_at: 1729440000,
            masked_token: None,
        }
        .with_masked_token();

        let json_val = serde_json::to_value(&account).expect("Must serialize");
        let obj = json_val.as_object().expect("Must be a JSON object");

        // Invariant: encrypted_token MUST NOT be present in JSON
        assert!(
            !obj.contains_key("encrypted_token"),
            "Sensitive token must be omitted via #[serde(skip_serializing)]"
        );
        // Masked token is provided
        assert_eq!(
            obj.get("masked_token").and_then(|v| v.as_str()),
            Some("vk_***1234")
        );
    }

    #[tokio::test]
    async fn test_encrypted_token_flow_with_keyring_and_db() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        let raw_token = "vk1.a.secret_test_token_1234567890";
        let master_key = match crypto::get_or_generate_key() {
            Ok(key) => key,
            Err(crypto::CryptoError::KeyringUnavailable(_)) => [42u8; 32],
            Err(e) => panic!("Unexpected crypto error: {:?}", e),
        };

        // 1. Encrypt raw token before saving
        let encrypted = crypto::encrypt_token(raw_token, &master_key).expect("Encryption failed");
        assert!(encrypted.contains(':'), "Encrypted token must have Base64(Nonce):Base64(Ciphertext)");

        let acc_input = CreateAccountInput {
            id: None,
            platform: "vk".to_string(),
            name: "Encrypted VK".to_string(),
            encrypted_token: encrypted.clone(),
            created_at: None,
        };

        let created = db::create_account(&pool, acc_input).await.expect("Save failed");

        // 2. Query directly from SQLite
        let raw_db_token: String = sqlx::query_scalar("SELECT encrypted_token FROM accounts WHERE id = ?")
            .bind(&created.id)
            .fetch_one(&pool)
            .await
            .expect("Fetch failed");

        assert_eq!(raw_db_token, encrypted, "Raw token in DB must match encrypted payload");
        assert_ne!(raw_db_token, raw_token, "Raw token in DB must NEVER be plain-text");

        // 3. Decrypt back using master key
        let decrypted = crypto::decrypt_token(&raw_db_token, &master_key).expect("Decryption failed");
        assert_eq!(decrypted, raw_token, "Decrypted token must match original raw token");

        // 4. Test frontend masking
        let safe_created = created.with_masked_token();
        let json_val = serde_json::to_value(&safe_created).expect("Serialization failed");
        assert!(json_val.get("encrypted_token").is_none());
        assert!(json_val.get("masked_token").unwrap().as_str().unwrap().starts_with("vk_***"));
    }

    /// Task 5 Unit Test:
    /// Manually insert a post scheduled 5 minutes ago (300 seconds ago).
    /// Run one iteration of the worker and verify that post status transitions to 'published'.
    #[tokio::test]
    async fn test_scheduler_worker_publishes_due_post() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        let test_key = [88u8; 32];
        let plain_token = "vk1.a.secret_oauth_token_for_scheduled_post";
        let encrypted_token = crypto::encrypt_token(plain_token, &test_key).expect("Token encryption failed");

        // 1. Create account with encrypted token
        let acc_input = CreateAccountInput {
            id: None,
            platform: "vk".to_string(),
            name: "VK Scheduled Group".to_string(),
            encrypted_token,
            created_at: None,
        };
        let created_acc = db::create_account(&pool, acc_input).await.expect("Failed to create account");

        // 2. Insert post scheduled 5 minutes ago (now - 300 seconds)
        let five_minutes_ago = chrono::Utc::now().timestamp() - 300;
        let post_input = CreatePostInput {
            id: None,
            content: "Automated scheduled message from background worker".to_string(),
            media_urls: Some(vec!["https://example.com/banner.png".to_string()]),
            status: Some("scheduled".to_string()),
            scheduled_for: Some(five_minutes_ago),
            created_at: Some(five_minutes_ago - 120),
            destination_account_ids: Some(vec![created_acc.id.clone()]),
        };
        let created_post = db::create_post(&pool, post_input).await.expect("Failed to create post");
        assert_eq!(created_post.status, "scheduled");

        // 3. Execute one iteration of the worker
        let publisher = publisher::MockPublisher::with_delay(10);
        let count = scheduler::process_due_posts(&pool, &publisher, Some(test_key))
            .await
            .expect("Worker execution failed");

        assert_eq!(count, 1, "Should process exactly 1 due post");

        // 4. Verify post status in SQLite changed to 'published'
        let post_after = db::get_post_by_id(&pool, &created_post.id)
            .await
            .expect("Query failed")
            .expect("Post should exist");

        assert_eq!(
            post_after.status, "published",
            "Post status must be updated to 'published' by the background worker"
        );
    }

    #[tokio::test]
    async fn test_scheduler_worker_marks_failed_on_network_error() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        let test_key = [99u8; 32];
        let encrypted_token = crypto::encrypt_token("some_token", &test_key).unwrap();

        let acc = db::create_account(
            &pool,
            CreateAccountInput {
                id: None,
                platform: "tg".to_string(),
                name: "TG Channel".to_string(),
                encrypted_token,
                created_at: None,
            },
        )
        .await
        .unwrap();

        let five_minutes_ago = chrono::Utc::now().timestamp() - 300;
        let post = db::create_post(
            &pool,
            CreatePostInput {
                id: None,
                content: "Failing post".to_string(),
                media_urls: None,
                status: Some("scheduled".to_string()),
                scheduled_for: Some(five_minutes_ago),
                created_at: None,
                destination_account_ids: Some(vec![acc.id]),
            },
        )
        .await
        .unwrap();

        // Run with failing publisher
        let publisher = publisher::MockPublisher::failing();
        let _ = scheduler::process_due_posts(&pool, &publisher, Some(test_key)).await;

        let post_after = db::get_post_by_id(&pool, &post.id).await.unwrap().unwrap();
        assert_eq!(post_after.status, "failed", "Post must be marked 'failed' when network error occurs");
    }

    #[tokio::test]
    async fn test_partial_success_and_duplicate_protection() {
        use std::collections::HashMap;
        use std::sync::Mutex;

        struct TestPublisher {
            call_counts: Mutex<HashMap<String, usize>>,
        }

        impl publisher::PostPublisher for TestPublisher {
            async fn publish(
                &self,
                platform: &str,
                account_name: &str,
                token: &str,
                _content: &str,
                _media_urls: &[String],
            ) -> Result<String, String> {
                let mut counts = self.call_counts.lock().unwrap();
                *counts.entry(account_name.to_string()).or_insert(0) += 1;

                if account_name.contains("Failing") {
                    // Leak token and exceed 500 characters
                    let err = format!("API failed for token {}: {}", token, "E".repeat(700));
                    Err(err)
                } else {
                    Ok(format!("{}_ok_id", platform))
                }
            }
        }

        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        let test_key = [77u8; 32];
        let token_a = "token_account_a_clean";
        let token_b = "token_account_b_secret_leak";

        let enc_a = crypto::encrypt_token(token_a, &test_key).unwrap();
        let enc_b = crypto::encrypt_token(token_b, &test_key).unwrap();

        let acc_a = db::create_account(
            &pool,
            CreateAccountInput {
                id: None,
                platform: "vk".to_string(),
                name: "Success Channel A".to_string(),
                encrypted_token: enc_a,
                created_at: None,
            },
        )
        .await
        .unwrap();

        let acc_b = db::create_account(
            &pool,
            CreateAccountInput {
                id: None,
                platform: "tg".to_string(),
                name: "Failing Channel B".to_string(),
                encrypted_token: enc_b,
                created_at: None,
            },
        )
        .await
        .unwrap();

        let due_time = chrono::Utc::now().timestamp() - 100;
        let post = db::create_post(
            &pool,
            CreatePostInput {
                id: None,
                content: "Cross-platform post to A and B".to_string(),
                media_urls: None,
                status: Some("scheduled".to_string()),
                scheduled_for: Some(due_time),
                created_at: None,
                destination_account_ids: Some(vec![acc_a.id.clone(), acc_b.id.clone()]),
            },
        )
        .await
        .unwrap();

        let publisher = TestPublisher {
            call_counts: Mutex::new(HashMap::new()),
        };

        // 1. First iteration: Account A succeeds, Account B fails -> Post becomes partially_published
        let count = scheduler::process_due_posts(&pool, &publisher, Some(test_key))
            .await
            .expect("Worker iteration failed");
        assert_eq!(count, 1, "Should count partially published post as processed");

        let post_after = db::get_post_by_id(&pool, &post.id).await.unwrap().unwrap();
        assert_eq!(
            post_after.status, "partially_published",
            "Post must be marked 'partially_published'"
        );

        // Verify destinations
        let dests = db::get_post_destinations(&pool, &post.id).await.unwrap();
        let dest_a = dests.iter().find(|d| d.account_id == acc_a.id).unwrap();
        let dest_b = dests.iter().find(|d| d.account_id == acc_b.id).unwrap();

        assert_eq!(dest_a.status, "published");
        assert!(dest_a.error_log.is_none());

        assert_eq!(dest_b.status, "failed");
        let log_b = dest_b.error_log.as_ref().expect("error_log must be present");

        // Invariant: Secret Redaction 2.0 (token must not be present, [REDACTED] must be present)
        assert!(!log_b.contains(token_b), "Raw token must be redacted from error_log");
        assert!(log_b.contains("[REDACTED]"), "Redaction placeholder must be present");

        // Invariant: Log limit (max 500 characters)
        assert!(log_b.chars().count() <= 500, "error_log must be <= 500 characters");

        // 2. Second iteration: Duplicate protection test
        // Mark post back to scheduled to simulate manual retry or rerun
        db::update_post_status(&pool, &post.id, "scheduled").await.unwrap();

        let _ = scheduler::process_due_posts(&pool, &publisher, Some(test_key)).await;

        let counts = publisher.call_counts.lock().unwrap();
        // Invariant: Account A must NOT be re-sent because its destination status was 'published'
        assert_eq!(
            *counts.get("Success Channel A").unwrap_or(&0),
            1,
            "Account A must NOT be published to again (Duplicate Protection)"
        );
        // Account B was failed so it was retried
        assert_eq!(
            *counts.get("Failing Channel B").unwrap_or(&0),
            2,
            "Account B was retried"
        );
    }

    #[tokio::test]
    async fn test_draft_and_scheduled_post_validation() {
        let temp_dir = tempdir().expect("Failed to create temp dir");
        let pool = db::init_db(temp_dir.path()).await.expect("Failed to init db");

        // 1. Draft post without destination accounts and empty content should succeed
        let draft_input = CreatePostInput {
            id: None,
            content: "".to_string(),
            media_urls: None,
            status: Some("draft".to_string()),
            scheduled_for: None,
            created_at: None,
            destination_account_ids: None,
        };
        let created_draft = db::create_post(&pool, draft_input).await.expect("Draft creation should succeed");
        assert_eq!(created_draft.status, "draft");
        assert_eq!(created_draft.content, "");
        assert_eq!(created_draft.destination_account_ids.len(), 0);

        // 2. Scheduled post with empty content must be rejected
        let invalid_scheduled = CreatePostInput {
            id: None,
            content: "   ".to_string(),
            media_urls: None,
            status: Some("scheduled".to_string()),
            scheduled_for: Some(chrono::Utc::now().timestamp() + 3600),
            created_at: None,
            destination_account_ids: None,
        };
        let res = db::create_post(&pool, invalid_scheduled).await;
        assert!(res.is_err(), "Scheduled post with whitespace content must be rejected");
    }
}
