"""統一的 LLM provider 介面,支援 Anthropic / OpenAI / Gemini 三選一。

用法:
    provider = get_provider("openai")        # 讀環境變數 LLM_PROVIDER 預設
    text = provider.generate(prompt)
    if provider.available:                    # False → 呼叫會丟 ProviderUnavailable
        ...

每個 provider 在首次呼叫 `generate()` 時才動態 import 對應 SDK,
缺套件或缺 API key 時 `available` 為 False,讓上層 fallback 到合成詞彙。
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from config import (
    ANTHROPIC_API_KEY,
    GEMINI_API_KEY,
    LLM_CONFIGS,
    LLM_PROVIDER,
    OPENAI_API_KEY,
)

log = logging.getLogger(__name__)


class ProviderUnavailable(RuntimeError):
    """Raised when generate() is called on a provider with no key / no SDK."""


class LLMProvider(Protocol):
    name: str
    model: str
    available: bool

    def generate(self, prompt: str) -> str: ...


@dataclass
class _BaseProvider:
    name: str
    model: str
    max_tokens: int
    api_key: str

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _require(self) -> None:
        if not self.api_key:
            raise ProviderUnavailable(f"{self.name}: API key missing")


class AnthropicProvider(_BaseProvider):
    def generate(self, prompt: str) -> str:
        self._require()
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key)
        resp = client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            b.text for b in resp.content if getattr(b, "type", None) == "text"
        )


class OpenAIProvider(_BaseProvider):
    def generate(self, prompt: str) -> str:
        self._require()
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key)
        resp = client.chat.completions.create(
            model=self.model,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""


class GeminiProvider(_BaseProvider):
    def generate(self, prompt: str) -> str:
        self._require()
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            self.model,
            generation_config={
                "max_output_tokens": self.max_tokens,
                "response_mime_type": "application/json",
            },
        )
        resp = model.generate_content(prompt)
        return resp.text or ""


_REGISTRY: dict[str, tuple[type[_BaseProvider], str]] = {
    "anthropic": (AnthropicProvider, ANTHROPIC_API_KEY),
    "openai": (OpenAIProvider, OPENAI_API_KEY),
    "gemini": (GeminiProvider, GEMINI_API_KEY),
}


def get_provider(name: str | None = None) -> LLMProvider:
    """Resolve a provider by name (defaults to LLM_PROVIDER env var)."""
    key = (name or LLM_PROVIDER).lower()
    if key not in _REGISTRY:
        raise ValueError(
            f"unknown LLM provider: {key!r}. choose from {list(_REGISTRY)}."
        )
    cls, api_key = _REGISTRY[key]
    cfg = LLM_CONFIGS[key]
    return cls(name=key, model=cfg["model"], max_tokens=cfg["max_tokens"], api_key=api_key)
