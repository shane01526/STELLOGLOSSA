"""STELLOGLOSSA 主管線。

用法:
    python pipeline.py --stage all
    python pipeline.py --stage extract
    python pipeline.py --stage phonology
    python pipeline.py --stage lexicon
    python pipeline.py --stage contact
    python pipeline.py --stage embed
    python pipeline.py --stage drift
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
sys.path.insert(0, str(ROOT))

from src.analysis import drift_export, family_tree, hypothesis_tester, report_writer
from src.api import letter_composer, lexicon_generator, poem_composer, semantic_embedder
from src.core import audio_renderer, contact_model, drift_simulator, phonology_engine, pulsar_extractor
from src.viz import bundle_data


STAGES = (
    "extract", "phonology", "lexicon", "contact", "embed",
    "drift", "analyze", "drift_summary", "tree", "report",
    "audio", "poems", "letters", "bundle",
)
PROVIDERS = ("anthropic", "openai", "gemini")


def run_all(provider: str | None = None, force_lexicon: bool = False) -> None:
    pulsars = pulsar_extractor.run()
    profiles = phonology_engine.run(pulsars)
    lexicon_generator.run(profiles, provider=provider, force=force_lexicon)
    contact_model.run(pulsars)
    semantic_embedder.run()
    drift_simulator.run()
    hypothesis_tester.run()
    drift_export.run()
    family_tree.run()
    audio_renderer.run()
    poem_composer.compose_all()
    letter_composer.compose_all()
    report_writer.run()
    bundle_data.run()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument(
        "--provider", choices=PROVIDERS, default=None,
        help="LLM for lexicon generation (overrides LLM_PROVIDER env var)",
    )
    parser.add_argument("--force-lexicon", action="store_true", help="ignore lexicon cache")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    if args.stage == "all":
        run_all(provider=args.provider, force_lexicon=args.force_lexicon)
        return

    dispatch = {
        "extract": pulsar_extractor.run,
        "phonology": phonology_engine.run,
        "lexicon": lambda: lexicon_generator.run(provider=args.provider, force=args.force_lexicon),
        "contact": contact_model.run,
        "embed": semantic_embedder.run,
        "drift": drift_simulator.run,
        "analyze": hypothesis_tester.run,
        "drift_summary": drift_export.run,
        "tree": family_tree.run,
        "report": report_writer.run,
        "audio": audio_renderer.run,
        "poems": poem_composer.compose_all,
        "letters": letter_composer.compose_all,
        "bundle": bundle_data.run,
    }
    dispatch[args.stage]()


if __name__ == "__main__":
    main()
