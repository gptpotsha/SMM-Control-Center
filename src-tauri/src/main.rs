// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    {
        // Bypass proxy for localhost and internal schemes to prevent ERR_CONNECTION_REFUSED
        // when system proxies (e.g. 127.0.0.1:8081 / 1081) intercept internal WebView2 traffic.
        unsafe {
            std::env::set_var(
                "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                "--proxy-bypass-list=\"<local>;localhost;127.0.0.1;*.localhost;tauri.localhost;asset.localhost\"",
            );
        }
    }

    smm_control_center_lib::run();
}
