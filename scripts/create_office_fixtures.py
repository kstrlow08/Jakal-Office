"""Regenerate Office's small, owned multi-section frontend fixture."""
from pathlib import Path

from server.document_backend import HwpxDocument


def main():
    document = HwpxDocument.blank()
    document.set_paragraph_text(0, 0, 'Office first section')
    document.append_equation('x^2+y^2=z^2')
    document.add_section(text='Office second section')
    destination = Path(__file__).resolve().parents[1] / 'web/tests/fixtures/two-sections.hwpx'
    destination.parent.mkdir(parents=True, exist_ok=True)
    document.save(destination)
    print(destination)
    document = HwpxDocument.blank()
    document.set_paragraph_text(0, 0, '각주 본문')
    document.append_footnote('각주 내용 가나다')
    document.append_endnote('미주 내용 가나다')
    document.append_shape(kind='rect', text='더 안성민', treat_as_char=False, horz_rel_to='PAPER', vert_rel_to='PAPER', horz_offset=2200, vert_offset=1700, width=12000, height=7600)
    document.save(destination.with_name('notes-objects.hwpx'))


if __name__ == '__main__':
    main()
