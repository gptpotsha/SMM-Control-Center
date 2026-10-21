use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

/// Contract: ParsedItem representation sent directly from Rust to frontend JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedItem {
    pub id: String,
    pub title: String,
    pub content: String,
    pub image_url: Option<String>,
    pub source_url: String,
    pub pub_date: Option<String>,
}

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

/// Resolves relative URLs (e.g. `/img/cat.png`) into absolute URLs using the base URL
fn resolve_url(src: &str, base: Option<&reqwest::Url>) -> Option<String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    if let Some(base_url) = base {
        base_url.join(trimmed).ok().map(|u| u.to_string())
    } else {
        Some(trimmed.to_string())
    }
}

/// Helper to strip HTML tags and normalize whitespace from RSS descriptions
fn clean_html_text(raw: &str) -> String {
    if !raw.contains('<') {
        return raw.trim().to_string();
    }
    let fragment = Html::parse_fragment(raw);
    let text = fragment.root_element().text().collect::<Vec<_>>().join(" ");
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Helper to extract first image from an HTML snippet (e.g. embedded in RSS description)
fn extract_img_from_html(raw: &str, base: Option<&reqwest::Url>) -> Option<String> {
    if !raw.contains("<img") {
        return None;
    }
    let fragment = Html::parse_fragment(raw);
    let selector = Selector::parse("img[src]").ok()?;
    let src = fragment.select(&selector).next()?.value().attr("src")?;
    resolve_url(src, base)
}

/// Helper to extract meta tag content with given CSS selector
fn get_meta(document: &Html, selector_str: &str) -> Option<String> {
    let selector = Selector::parse(selector_str).ok()?;
    document
        .select(&selector)
        .next()
        .and_then(|el| el.value().attr("content").or_else(|| el.value().attr("value")))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Parse HTML document for OpenGraph / Twitter / Standard metadata
pub fn parse_html(body: &str, url: &str) -> Vec<ParsedItem> {
    let base_url = reqwest::Url::parse(url).ok();
    let document = Html::parse_document(body);

    // 1. Title: OpenGraph -> Twitter -> <title> -> <h1>
    let title = get_meta(&document, r#"meta[property="og:title"]"#)
        .or_else(|| get_meta(&document, r#"meta[name="twitter:title"]"#))
        .or_else(|| {
            Selector::parse("title")
                .ok()
                .and_then(|sel| document.select(&sel).next())
                .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .or_else(|| {
            Selector::parse("h1")
                .ok()
                .and_then(|sel| document.select(&sel).next())
                .map(|el| el.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .filter(|s| !s.is_empty())
        })
        .unwrap_or_default();

    // 2. Content: OpenGraph description -> Meta description -> Twitter description -> First substantial <p>
    let content = get_meta(&document, r#"meta[property="og:description"]"#)
        .or_else(|| get_meta(&document, r#"meta[name="description"]"#))
        .or_else(|| get_meta(&document, r#"meta[name="twitter:description"]"#))
        .or_else(|| {
            Selector::parse("article p, main p, p")
                .ok()
                .and_then(|sel| {
                    document.select(&sel).find_map(|el| {
                        let text = el.text().collect::<Vec<_>>().join(" ").trim().to_string();
                        if text.len() >= 20 {
                            Some(text)
                        } else {
                            None
                        }
                    })
                })
        })
        .unwrap_or_default();

    // 3. Image URL: OpenGraph image -> Twitter image -> Main/article image -> First <img>
    let raw_image_url = get_meta(&document, r#"meta[property="og:image"]"#)
        .or_else(|| get_meta(&document, r#"meta[name="twitter:image"]"#))
        .or_else(|| {
            Selector::parse("article img[src], main img[src], img[src]")
                .ok()
                .and_then(|sel| {
                    document.select(&sel).find_map(|el| {
                        el.value()
                            .attr("src")
                            .filter(|src| !src.contains("data:image"))
                            .map(String::from)
                    })
                })
        });

    let image_url = raw_image_url.and_then(|src| resolve_url(&src, base_url.as_ref()));

    // 4. Publication date
    let pub_date = get_meta(&document, r#"meta[property="article:published_time"]"#)
        .or_else(|| get_meta(&document, r#"meta[name="pubdate"]"#))
        .or_else(|| get_meta(&document, r#"meta[name="date"]"#));

    // Edge Case: Fallback if nothing was extracted
    if title.is_empty() && content.is_empty() {
        return vec![ParsedItem {
            id: Uuid::new_v4().to_string(),
            title: "Не удалось извлечь контент".to_string(),
            content: format!(
                "Сайт {} не вернул распознаваемых данных (OpenGraph мета-тегов или текстового контента).",
                url
            ),
            image_url: None,
            source_url: url.to_string(),
            pub_date: None,
        }];
    }

    vec![ParsedItem {
        id: Uuid::new_v4().to_string(),
        title: if title.is_empty() {
            "Без заголовка".to_string()
        } else {
            title
        },
        content,
        image_url,
        source_url: url.to_string(),
        pub_date,
    }]
}

/// Parse RSS or Atom feeds
pub fn parse_feed(body: &str, url: &str) -> Result<Vec<ParsedItem>, String> {
    let base_url = reqwest::Url::parse(url).ok();

    // Try standard RSS channel
    if let Ok(channel) = rss::Channel::read_from(body.as_bytes()) {
        let mut items = Vec::new();
        for item in channel.items() {
            let title = item.title().unwrap_or("Без заголовка").trim().to_string();
            let raw_desc = item
                .description()
                .or_else(|| item.content())
                .unwrap_or("")
                .trim();
            let content = clean_html_text(raw_desc);

            // Image extraction: Enclosure -> Extensions -> HTML description
            let mut image_url = item
                .enclosure()
                .filter(|enc| enc.mime_type().starts_with("image/"))
                .map(|enc| enc.url().to_string());

            if image_url.is_none() {
                image_url = extract_img_from_html(raw_desc, base_url.as_ref());
            }

            let source_url = item
                .link()
                .map(String::from)
                .unwrap_or_else(|| url.to_string());

            let pub_date = item.pub_date().map(String::from);

            items.push(ParsedItem {
                id: Uuid::new_v4().to_string(),
                title,
                content,
                image_url,
                source_url,
                pub_date,
            });
        }

        if !items.is_empty() {
            return Ok(items);
        }
    }

    // Fallback: Try Atom syndication using scraper
    let doc = Html::parse_document(body);
    if let Ok(entry_selector) = Selector::parse("entry") {
        let mut items = Vec::new();
        for entry in doc.select(&entry_selector) {
            let title = Selector::parse("title")
                .ok()
                .and_then(|s| entry.select(&s).next())
                .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_else(|| "Без заголовка".to_string());

            let raw_desc = Selector::parse("summary, content")
                .ok()
                .and_then(|s| entry.select(&s).next())
                .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string())
                .unwrap_or_default();
            let content = clean_html_text(&raw_desc);

            let source_url = Selector::parse(r#"link[rel="alternate"], link"#)
                .ok()
                .and_then(|s| entry.select(&s).next())
                .and_then(|e| e.value().attr("href"))
                .and_then(|href| resolve_url(href, base_url.as_ref()))
                .unwrap_or_else(|| url.to_string());

            let mut image_url = extract_img_from_html(&raw_desc, base_url.as_ref());
            if image_url.is_none() {
                image_url = Selector::parse(r#"link[rel="enclosure"]"#)
                    .ok()
                    .and_then(|s| entry.select(&s).next())
                    .and_then(|e| e.value().attr("href"))
                    .and_then(|href| resolve_url(href, base_url.as_ref()));
            }

            let pub_date = Selector::parse("published, updated")
                .ok()
                .and_then(|s| entry.select(&s).next())
                .map(|e| e.text().collect::<Vec<_>>().join(" ").trim().to_string());

            items.push(ParsedItem {
                id: Uuid::new_v4().to_string(),
                title,
                content,
                image_url,
                source_url,
                pub_date,
            });
        }

        if !items.is_empty() {
            return Ok(items);
        }
    }

    Err("Не удалось распарсить RSS/Atom ленту".to_string())
}

/// Main routing function: Downloads URL with anti-blocking headers & 10s timeout,
/// determines format (XML vs HTML), and delegates to corresponding parser.
pub async fn parse_content_source(url: &str) -> Result<Vec<ParsedItem>, String> {
    let trimmed_url = url.trim();
    if trimmed_url.is_empty() {
        return Err("URL не может быть пустым".to_string());
    }

    // Invariant: Anti-Blocking & Strict 10-second timeout
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Ошибка создания HTTP клиента: {}", e))?;

    let response = client
        .get(trimmed_url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        )
        .header(
            reqwest::header::ACCEPT_LANGUAGE,
            "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        )
        .send()
        .await
        .map_err(|e| format!("Не удалось загрузить URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Сервер ответил кодом ошибки: {} ({})",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Error")
        ));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|val| val.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    let body = response
        .text()
        .await
        .map_err(|e| format!("Не удалось прочитать ответ сервера: {}", e))?;

    let trimmed_body = body.trim_start();

    // Edge Case: Routing (XML/RSS vs HTML)
    let is_xml = trimmed_url.ends_with(".xml")
        || trimmed_url.ends_with(".rss")
        || trimmed_url.ends_with(".atom")
        || content_type.contains("xml")
        || content_type.contains("rss")
        || content_type.contains("atom")
        || trimmed_body.starts_with("<?xml")
        || trimmed_body.starts_with("<rss")
        || trimmed_body.starts_with("<feed");

    if is_xml {
        match parse_feed(&body, trimmed_url) {
            Ok(items) => return Ok(items),
            Err(_) => {
                // If XML parsing failed, fallback gracefully to HTML parser
                return Ok(parse_html(&body, trimmed_url));
            }
        }
    }

    Ok(parse_html(&body, trimmed_url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_html_opengraph() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <meta property="og:title" content="Заголовок новости" />
                <meta property="og:description" content="Полное описание интересной новости." />
                <meta property="og:image" content="https://example.com/cover.jpg" />
                <meta property="article:published_time" content="2026-10-21T12:00:00Z" />
            </head>
            <body>
                <h1>Внутренний заголовок</h1>
            </body>
            </html>
        "#;

        let items = parse_html(html, "https://example.com/news/1");
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.title, "Заголовок новости");
        assert_eq!(item.content, "Полное описание интересной новости.");
        assert_eq!(item.image_url.as_deref(), Some("https://example.com/cover.jpg"));
        assert_eq!(item.pub_date.as_deref(), Some("2026-10-21T12:00:00Z"));
    }

    #[test]
    fn test_parse_html_fallback() {
        let html = r#"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Стандартный Title</title>
                <meta name="description" content="Стандартное описание страницы." />
            </head>
            <body>
                <article>
                    <p>Текст статьи, содержащий больше двадцати символов для проверки фоллбэка.</p>
                    <img src="/assets/photo.png" />
                </article>
            </body>
            </html>
        "#;

        let items = parse_html(html, "https://example.com/article");
        assert_eq!(items.len(), 1);
        let item = &items[0];
        assert_eq!(item.title, "Стандартный Title");
        assert_eq!(item.content, "Стандартное описание страницы.");
        assert_eq!(
            item.image_url.as_deref(),
            Some("https://example.com/assets/photo.png")
        );
    }

    #[test]
    fn test_parse_html_empty_graceful_failure() {
        let html = "<html><body><div></div></body></html>";
        let items = parse_html(html, "https://empty.com");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Не удалось извлечь контент");
    }

    #[test]
    fn test_parse_rss_feed() {
        let rss_xml = r#"<?xml version="1.0" encoding="UTF-8" ?>
            <rss version="2.0">
            <channel>
                <title>Канал новостей</title>
                <link>https://news.example.com</link>
                <description>Свежие новости каждый день</description>
                <item>
                    <title>Пост 1</title>
                    <link>https://news.example.com/1</link>
                    <description><![CDATA[<p>Описание первого поста</p><img src="https://news.example.com/img1.jpg"/>]]></description>
                    <pubDate>Wed, 21 Oct 2026 12:00:00 GMT</pubDate>
                </item>
            </channel>
            </rss>
        "#;

        let items = parse_feed(rss_xml, "https://news.example.com/rss.xml").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Пост 1");
        assert_eq!(items[0].content, "Описание первого поста");
        assert_eq!(
            items[0].image_url.as_deref(),
            Some("https://news.example.com/img1.jpg")
        );
    }
}
