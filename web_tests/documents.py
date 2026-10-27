"""Office integration fixtures, authored through the installed document module."""
import io
from pathlib import Path

from PIL import Image
from server.document_backend import HwpDocument, HwpxDocument


def image_bytes() -> bytes:
    output = io.BytesIO()
    with Image.new('RGB', (48, 32), '#3377aa') as image:
        image.save(output, 'PNG')
    return output.getvalue()


def office_document(destination: Path, kind: str = 'form') -> Path:
    # Office's owned demo already has a complete native table style catalogue.
    # The 1.0 blank-table donor can emit a dangling charPrIDRef on conversion.
    document = HwpDocument.open(Path(__file__).resolve().parents[1] / 'web/public/sample.hwp') if destination.suffix == '.hwp' else HwpxDocument.blank()
    document.append_paragraph('Office 통합 검증 문서')
    document.append_paragraph('수정할 본문과 특수 문자 & <안내> 😀')
    cells = [['항목', '값', '비고'], ['이름', '자칼', '유지할 내용'], ['금액', '12000', '원']]
    if destination.suffix == '.hwp':
        document.append_equation('x^2+y^2=z^2')
        document.append_picture(image_bytes(), extension='png')
    else:
        table = document.append_table(rows=3, columns=3, cell_texts=cells)
        if kind == 'merged':
            table.merge_cells(0, 0, 0, 2)
        document.append_equation('x^2+y^2=z^2')
        document.append_picture('office.png', image_bytes(), media_type='image/png')
        document.append_header('Jakal Office 검증')
    document.save(destination)
    return destination


def control_document(destination: Path) -> Path:
    document = HwpDocument.blank()
    document.append_paragraph('개체가 있는 문서의 실패 처리 검증')
    document.append_shape(kind='rect', text='변환 검증용 개체')
    document.save(destination)
    return destination


def landscape_pdf(pages: int = 5) -> bytes:
    import pypdfium2 as pdfium
    output = io.BytesIO()
    with pdfium.PdfDocument.new() as document:
        for _ in range(pages):
            document.new_page(842, 595).close()
        document.save(output)
    return output.getvalue()
