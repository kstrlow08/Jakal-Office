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


if __name__ == '__main__':
    main()
