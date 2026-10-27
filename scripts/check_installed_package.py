"""Smoke-test an installed Office distribution outside the source checkout."""
from importlib import metadata
from pathlib import Path
import tempfile

import jakal_hwpx
import server
from server.document_backend import HwpxDocument
from server.engine import process


def main():
    office = metadata.distribution('jakal-office')
    dependency = metadata.distribution('jakal-hwpx')
    assert dependency.version == '1.0'
    assert 'site-packages' in Path(jakal_hwpx.__file__).parts
    assert not any(str(file).startswith('jakal_hwpx/') for file in office.files)
    assert Path(server.__file__).with_name('convert_hwp.mjs').is_file()
    with tempfile.TemporaryDirectory(prefix='office-smoke-') as name:
        directory = Path(name)
        document = HwpxDocument.blank()
        document.set_paragraph_text(0, 0, '설치된 모듈로 문서 편집')
        document.append_table(rows=1, columns=1, cell_texts=[['외부 의존성']])
        document.save(directory / 'revision-0.hwpx')
        process(directory, 'analyze', {}, 'smoke.hwpx')
        process(directory, 'edit', {'revision': 0, 'operations': [
            {'type': 'paragraph', 'section': 0, 'index': 0, 'text': '수정 완료 😀'}]}, 'smoke.hwpx')
        result = process(directory, 'validate', {'revision': 1}, 'smoke.hwpx')
        assert result['report']['new_issues'] == []
        assert HwpxDocument.open(directory / 'revision-1.hwpx').sections[0].text_fragments()[0] == '수정 완료 😀'
    print(f'jakal-office {office.version}: installed server and external jakal-hwpx {dependency.version} OK')


if __name__ == '__main__':
    main()
