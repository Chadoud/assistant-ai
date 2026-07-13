"""Tests for the multimodal message contract and per-provider image rendering."""

from __future__ import annotations

import base64

import pytest

from llm.base import (
    image_part,
    is_multimodal,
    iter_parts,
    part_image_bytes,
    text_part,
)


# ── base content-part helpers ─────────────────────────────────────────────────
def test_image_part_encodes_raw_bytes():
    part = image_part(b"\x00\x01\x02", "image/png")
    assert part == {
        "type": "image",
        "mime_type": "image/png",
        "data": base64.b64encode(b"\x00\x01\x02").decode("ascii"),
    }


def test_image_part_passes_through_base64_string():
    encoded = base64.b64encode(b"abc").decode("ascii")
    assert image_part(encoded)["data"] == encoded


def test_iter_parts_wraps_string_and_drops_empty():
    assert iter_parts("hello") == [{"type": "text", "text": "hello"}]
    assert iter_parts("") == []
    assert iter_parts(None) == []


def test_is_multimodal_only_for_lists():
    assert is_multimodal([text_part("a")]) is True
    assert is_multimodal("a") is False


def test_part_image_bytes_roundtrip():
    assert part_image_bytes(image_part(b"abc")) == b"abc"


def _image_message():
    return [{"role": "user", "content": [text_part("look at this"), image_part(b"\x01\x02", "image/png")]}]


# ── Gemini ─────────────────────────────────────────────────────────────────────
class _FakePart:
    def __init__(self, text=None, data=None, mime_type=None):
        self.text = text
        self.data = data
        self.mime_type = mime_type

    @classmethod
    def from_bytes(cls, *, data, mime_type):
        return cls(data=data, mime_type=mime_type)


class _FakeContent:
    def __init__(self, role, parts):
        self.role = role
        self.parts = parts


class _FakeGenaiTypes:
    Part = _FakePart
    Content = _FakeContent


def test_gemini_renders_image_parts():
    from llm import gemini_provider

    contents = gemini_provider._build_contents(_image_message(), _FakeGenaiTypes)
    assert len(contents) == 1 and contents[0].role == "user"
    parts = contents[0].parts
    assert parts[0].text == "look at this"
    assert parts[1].data == b"\x01\x02" and parts[1].mime_type == "image/png"


def test_gemini_text_only_unaffected():
    from llm import gemini_provider

    contents = gemini_provider._build_contents(
        [{"role": "user", "content": "plain"}], _FakeGenaiTypes
    )
    assert contents[0].parts[0].text == "plain"


# ── OpenAI ───────────────────────────────────────────────────────────────────────
def test_openai_renders_image_parts():
    from llm.openai_provider import _to_openai_messages

    content = _to_openai_messages(_image_message())[0]["content"]
    assert isinstance(content, list)
    assert content[0] == {"type": "text", "text": "look at this"}
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_openai_text_only_stays_string():
    from llm.openai_provider import _to_openai_messages

    out = _to_openai_messages([{"role": "user", "content": "hi"}])
    assert out[0]["content"] == "hi"


# ── Anthropic ────────────────────────────────────────────────────────────────────
def test_anthropic_renders_image_parts():
    from llm.anthropic_provider import _to_anthropic_messages

    blocks = _to_anthropic_messages(_image_message())[0]["content"]
    assert blocks[0] == {"type": "text", "text": "look at this"}
    assert blocks[1]["type"] == "image"
    assert blocks[1]["source"] == {
        "type": "base64",
        "media_type": "image/png",
        "data": base64.b64encode(b"\x01\x02").decode("ascii"),
    }


def test_anthropic_text_only_stays_string():
    from llm.anthropic_provider import _to_anthropic_messages

    out = _to_anthropic_messages([{"role": "user", "content": "hi"}])
    assert out[0]["content"] == "hi"


# ── Ollama (best-effort) ───────────────────────────────────────────────────────
def test_ollama_attaches_images_field():
    pytest.importorskip("ollama")
    from llm.ollama_provider import _to_ollama_messages

    out = _to_ollama_messages(_image_message())
    assert out[0]["content"] == "look at this"
    assert out[0]["images"] == [base64.b64encode(b"\x01\x02").decode("ascii")]
