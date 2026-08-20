use std::fmt::Debug;

use herdr_compat::protocol::{
    read_message, write_message, ClientKeybindings, ClientLaunchMode, ClientMessage, FramingError,
    RenderEncoding, ServerMessage, MAX_FRAME_SIZE, PROTOCOL_VERSION,
};
use serde::{de::DeserializeOwned, Serialize};

fn fixture(name: &str) -> Vec<u8> {
    include_str!("fixtures/protocol20-frames.hex")
        .lines()
        .filter_map(|line| line.strip_prefix(&format!("{name}=")))
        .next()
        .unwrap_or_else(|| panic!("missing protocol20 fixture {name}"))
        .as_bytes()
        .chunks(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}

fn assert_frame<T>(name: &str, message: T)
where
    T: Serialize + DeserializeOwned + PartialEq + Debug,
{
    let expected = fixture(name);
    let mut encoded = Vec::new();
    write_message(&mut encoded, &message).unwrap();
    assert_eq!(
        encoded, expected,
        "frozen protocol-20 frame changed: {name}"
    );
    let decoded: T = read_message(&mut expected.as_slice(), MAX_FRAME_SIZE).unwrap();
    assert_eq!(decoded, message);
}

#[test]
fn protocol20_frozen_frames_cover_new_wire_shape() {
    assert_eq!(PROTOCOL_VERSION, 20);
    assert_frame(
        "hello",
        ClientMessage::Hello {
            version: PROTOCOL_VERSION,
            cols: 80,
            rows: 24,
            cell_width_px: 0,
            cell_height_px: 0,
            requested_encoding: RenderEncoding::TerminalAnsi,
            keybindings: ClientKeybindings::Server,
            launch_mode: ClientLaunchMode::TerminalAttach,
        },
    );
    assert_frame(
        "welcome",
        ServerMessage::Welcome {
            version: PROTOCOL_VERSION,
            encoding: RenderEncoding::TerminalAnsi,
            error: None,
        },
    );
    assert_frame(
        "mouse_capture",
        ServerMessage::MouseCapture {
            enabled: true,
            sgr_pixels: true,
        },
    );
    assert_frame("terminal_bell", ServerMessage::TerminalBell { count: 3 });
    assert_frame(
        "graphics_transmission_started",
        ClientMessage::GraphicsTransmissionStarted {
            transfer_id: 7,
            image_id: 42,
        },
    );
    assert_frame(
        "graphics_transmission_result",
        ClientMessage::GraphicsTransmissionResult {
            transfer_id: 7,
            image_id: 42,
            success: true,
        },
    );
    assert_frame(
        "input_pixels",
        ClientMessage::InputPixels {
            data: b"\x1b[<35;321;241M".to_vec(),
            cols: 80,
            rows: 24,
            width_px: 800,
            height_px: 480,
        },
    );
    assert_frame(
        "graphics_file",
        ServerMessage::GraphicsFile {
            path: "/tmp/frame".into(),
            expected_len: 4,
            image_id: 42,
            transfer_id: 7,
            leading: b"\x1b[2;3H".to_vec(),
            control: "a=T,f=32,i=42,q=0".into(),
        },
    );
    assert_frame(
        "graphics_transmission_retired",
        ServerMessage::GraphicsTransmissionRetired {
            transfer_id: 7,
            image_id: 42,
        },
    );
}

#[test]
fn protocol20_enum_discriminants_keep_terminal_attach_after_direct_graphics_mode() {
    let hello = ClientMessage::Hello {
        version: PROTOCOL_VERSION,
        cols: 80,
        rows: 24,
        cell_width_px: 0,
        cell_height_px: 0,
        requested_encoding: RenderEncoding::TerminalAnsi,
        keybindings: ClientKeybindings::Server,
        launch_mode: ClientLaunchMode::TerminalAttach,
    };
    let payload = bincode::serde::encode_to_vec(&hello, bincode::config::standard()).unwrap();
    assert_eq!(payload, [0, 20, 80, 24, 0, 0, 1, 0, 2]);

    let app_direct = bincode::serde::encode_to_vec(
        &ClientLaunchMode::AppDirectGraphics,
        bincode::config::standard(),
    )
    .unwrap();
    assert_eq!(app_direct, [1]);
}

#[test]
fn protocol20_fixture_reader_rejects_trailing_payload_bytes() {
    let mut frame = fixture("welcome");
    frame[0] += 1;
    frame.push(0);
    let error =
        read_message::<_, ServerMessage>(&mut frame.as_slice(), MAX_FRAME_SIZE).unwrap_err();
    assert!(matches!(error, FramingError::Bincode(_)));
}
