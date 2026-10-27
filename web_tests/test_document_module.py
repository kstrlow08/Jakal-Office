"""Keep Office's package boundary independent of the old vendored source tree."""
from importlib import metadata
from pathlib import Path

import jakal_hwpx
from server.document_backend import HwpxDocument
from server.process_environment import parser_environment


def test_document_engine_is_the_pinned_external_distribution():
    root = Path(__file__).resolve().parents[1]
    source = Path(jakal_hwpx.__file__).resolve()
    assert metadata.version('jakal-hwpx') == '1.0'
    assert 'site-packages' in source.parts
    assert not source.is_relative_to(root / 'src')
    assert HwpxDocument.__bases__ == (jakal_hwpx.HwpxDocument,)
    assert not (root / 'src/jakal_hwpx/__init__.py').exists()


def test_parser_process_uses_office_and_installed_modules(tmp_path, monkeypatch):
    monkeypatch.setenv('PYTHONPATH', str(tmp_path / 'untrusted'))
    environment = parser_environment(tmp_path)
    assert environment['PYTHONPATH'] == str(tmp_path)
