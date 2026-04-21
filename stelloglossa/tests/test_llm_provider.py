import pytest

from src.api import llm_provider
from src.api.llm_provider import (
    AnthropicProvider,
    GeminiProvider,
    OpenAIProvider,
    ProviderUnavailable,
    get_provider,
)


def test_get_provider_anthropic():
    p = get_provider("anthropic")
    assert isinstance(p, AnthropicProvider)
    assert p.name == "anthropic"
    assert p.model.startswith("claude")


def test_get_provider_openai():
    p = get_provider("openai")
    assert isinstance(p, OpenAIProvider)
    assert p.name == "openai"
    assert p.model.startswith("gpt")


def test_get_provider_gemini():
    p = get_provider("gemini")
    assert isinstance(p, GeminiProvider)
    assert p.name == "gemini"
    assert p.model.startswith("gemini")


def test_get_provider_case_insensitive():
    assert get_provider("Anthropic").name == "anthropic"
    assert get_provider("OPENAI").name == "openai"


def test_get_provider_rejects_unknown():
    with pytest.raises(ValueError, match="unknown LLM provider"):
        get_provider("llama")


def test_unavailable_provider_raises_on_generate(monkeypatch):
    monkeypatch.setattr(llm_provider, "OPENAI_API_KEY", "", raising=False)
    p = OpenAIProvider(name="openai", model="gpt-4o", max_tokens=100, api_key="")
    assert p.available is False
    with pytest.raises(ProviderUnavailable):
        p.generate("hello")


def test_available_flag_reflects_api_key():
    p1 = AnthropicProvider(name="anthropic", model="claude", max_tokens=100, api_key="sk-xxx")
    p2 = AnthropicProvider(name="anthropic", model="claude", max_tokens=100, api_key="")
    assert p1.available and not p2.available


def test_lexicon_falls_back_when_all_attempts_fail(tmp_path, monkeypatch):
    """Generator must never write an empty lexicon — if API keeps failing, fall back."""
    from config import SEMANTIC_FIELDS, WORDS_PER_FIELD
    from src.api import lexicon_generator

    class FailingProvider:
        name = "openai"
        model = "gpt-4o"
        available = True

        def generate(self, prompt):
            raise RuntimeError("401 unauthorized")

    monkeypatch.setattr(lexicon_generator, "LEXICON_DIR", tmp_path)
    profile = {
        "jname": "JTEST",
        "constellation": "Test",
        "syllable_structure": "CV",
        "tone_count": 0,
        "tense_richness": "none",
        "vowel_inventory": ["a", "i", "u"],
    }
    out = lexicon_generator.generate_for(profile, provider=FailingProvider(), use_llm=True)
    assert out["provider"].endswith("+fallback")
    for field in SEMANTIC_FIELDS:
        assert len(out["lexicon"][field]) == WORDS_PER_FIELD
