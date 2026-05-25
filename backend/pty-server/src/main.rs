use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem, MasterPty, Child};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;
use std::io::{Read, Write};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

#[derive(Deserialize, Debug)]
#[serde(tag = "action")]
enum ClientMessage {
    #[serde(rename = "spawn")]
    Spawn {
        shell: String,
        distro: Option<String>,
        cwd: String,
        cols: u16,
        rows: u16,
        /// WSL: `bash -lc` mit diesem Befehl (z. B. Hermes-Chat)
        command: Option<String>,
    },
    #[serde(rename = "resize")]
    Resize {
        cols: u16,
        rows: u16,
    },
}

#[tokio::main]
async fn main() {
    let addr = "127.0.0.1:8643";
    let listener = TcpListener::bind(addr).await.expect("Failed to bind to port 8643");
    println!("[PTY SERVER] Listening on: ws://{}", addr);

    while let Ok((stream, client_addr)) = listener.accept().await {
        tokio::spawn(handle_connection(stream, client_addr));
    }
}

async fn handle_connection(stream: TcpStream, addr: SocketAddr) {
    println!("[PTY SERVER] New connection from: {}", addr);
    
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[PTY SERVER] Error during WebSocket handshake: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    
    // 1. Warte auf die initiale "spawn" Nachricht
    let mut master_pty: Option<Arc<Mutex<Box<dyn MasterPty + Send>>>> = None;
    let mut child_process: Option<Box<dyn Child + Send>> = None;

    while let Some(msg_result) = ws_receiver.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[PTY SERVER] Error receiving message: {}", e);
                break;
            }
        };

        if msg.is_close() {
            break;
        }

        if let Ok(text) = msg.to_text() {
            // Versuche als JSON zu parsen
            if text.starts_with('{') && text.ends_with('}') {
                if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(text) {
                    match client_msg {
                        ClientMessage::Spawn { shell, distro, cwd, cols, rows, command } => {
                            println!(
                                "[PTY SERVER] Spawning shell: {}, distro: {:?}, cwd: {}, command: {:?}, size: {}x{}",
                                shell, distro, cwd, command, cols, rows
                            );

                            let pty_system = NativePtySystem::default();
                            let pty_pair = match pty_system.openpty(PtySize {
                                rows,
                                cols,
                                pixel_width: 0,
                                pixel_height: 0,
                            }) {
                                Ok(pair) => pair,
                                Err(e) => {
                                    eprintln!("[PTY SERVER] Failed to open PTY: {}", e);
                                    let _ = ws_sender.send(Message::Text(format!("Error: Failed to open PTY: {}", e))).await;
                                    return;
                                }
                            };

                            let mut cmd_builder = match shell.as_str() {
                                "wsl" => {
                                    let mut builder = CommandBuilder::new("wsl.exe");
                                    if let Some(ref d) = distro {
                                        builder.arg("-d");
                                        builder.arg(d);
                                    }
                                    if let Some(ref cmd) = command {
                                        builder.arg("--");
                                        builder.arg("bash");
                                        builder.arg("-lc");
                                        builder.arg(cmd.as_str());
                                    }
                                    builder
                                }
                                "cmd" => CommandBuilder::new("cmd.exe"),
                                _ => {
                                    // PowerShell als Default, prüfe ob modernere pwsh.exe im PATH ist
                                    let pwsh_available = which::which("pwsh.exe").is_ok();
                                    if pwsh_available {
                                        CommandBuilder::new("pwsh.exe")
                                    } else {
                                        CommandBuilder::new("powershell.exe")
                                    }
                                }
                            };

                            cmd_builder.cwd(cwd);

                            // Windows UTF-8 Codepage aktivieren für PowerShell/CMD (chcp 65001)
                            if shell != "wsl" {
                                cmd_builder.env("LANG", "de_DE.UTF-8");
                            }

                            let spawned_child = match pty_pair.slave.spawn_command(cmd_builder) {
                                Ok(c) => c,
                                Err(e) => {
                                    eprintln!("[PTY SERVER] Failed to spawn shell command: {}", e);
                                    let _ = ws_sender.send(Message::Text(format!("Error: Failed to spawn shell: {}", e))).await;
                                    return;
                                }
                            };

                            let m_pty = Arc::new(Mutex::new(pty_pair.master));
                            master_pty = Some(m_pty.clone());
                            child_process = Some(spawned_child);

                            // Reader-Thread starten (PTY -> WebSocket)
                            let reader_m_pty = m_pty.clone();
                            let mut reader = match reader_m_pty.lock().await.try_clone_reader() {
                                Ok(r) => r,
                                Err(e) => {
                                    eprintln!("[PTY SERVER] Failed to clone PTY reader: {}", e);
                                    return;
                                }
                            };

                            // WebSocket-Sender via Clone/Mutex teilen
                            let shared_sender = Arc::new(Mutex::new(ws_sender));
                            let loop_sender = shared_sender.clone();

                            tokio::task::spawn_blocking(move || {
                                let mut buffer = [0u8; 4096];
                                loop {
                                    match reader.read(&mut buffer) {
                                        Ok(0) => break, // EOF
                                        Ok(n) => {
                                            let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                                            let sender = loop_sender.clone();
                                            tokio::spawn(async move {
                                                let mut s = sender.lock().await;
                                                let _ = s.send(Message::Text(text)).await;
                                            });
                                        }
                                        Err(e) => {
                                            eprintln!("[PTY SERVER] Error reading from PTY: {}", e);
                                            break;
                                        }
                                    }
                                }
                            });

                            // Weiteren Empfang über den Haupt-WebSocket-Loop abhandeln
                            break;
                        }
                        _ => {
                            eprintln!("[PTY SERVER] Received unexpected message before spawn");
                        }
                    }
                }
            }
        }
    }

    // Wenn PTY aktiv, starte bidirektionalen Schreib-Loop
    if let (Some(m_pty), Some(mut child)) = (master_pty, child_process) {
        let mut writer = match m_pty.lock().await.take_writer() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[PTY SERVER] Failed to take PTY writer: {}", e);
                return;
            }
        };

        while let Some(msg_result) = ws_receiver.next().await {
            let msg = match msg_result {
                Ok(m) => m,
                Err(_) => break,
            };

            if msg.is_close() {
                break;
            }

            if let Ok(text) = msg.to_text() {
                // Prüfe, ob es sich um ein JSON Resize-Event handelt
                if text.starts_with('{') && text.ends_with('}') {
                    if let Ok(ClientMessage::Resize { cols, rows }) = serde_json::from_str::<ClientMessage>(text) {
                        println!("[PTY SERVER] Resizing PTY to {}x{}", cols, rows);
                        let m = m_pty.lock().await;
                        let _ = m.resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                        continue;
                    }
                }

                // Rohe Daten ins PTY schreiben
                if let Err(e) = writer.write_all(text.as_bytes()) {
                    eprintln!("[PTY SERVER] Error writing to PTY: {}", e);
                    break;
                }
                let _ = writer.flush();
            }
        }

        // Cleanup
        println!("[PTY SERVER] Connection closed, killing shell process...");
        let _ = child.kill();
    }
}
