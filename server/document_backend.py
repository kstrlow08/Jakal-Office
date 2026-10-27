"""Office's boundary to the independently installed jakal-hwpx 1.0 module.

The pinned release counts Python characters in cached line positions. Office
also receives UTF-16 offsets and explicit line breaks from the WASM editor.
Filter those false positives here; parsing, editing, repair and serialization
remain implemented by the external module. Remove this override when upstream
ships the corresponding fix and the integration regressions pass unchanged.
"""
from jakal_hwpx import HwpDocument, HwpxDocument as ModuleHwpxDocument
from jakal_hwpx.namespaces import NS

__all__ = ['HwpDocument', 'HwpxDocument']


class HwpxDocument(ModuleHwpxDocument):
    def _stale_paragraph_layout_targets(self):
        targets = []
        for target in super()._stale_paragraph_layout_targets():
            paragraph = target[3]
            texts = paragraph.xpath('.//hp:t', namespaces=NS)
            # Unknown inline controls have format-specific widths. The module
            # must not discard their layout based on a guessed character count.
            if any(child.tag != f'{{{NS["hp"]}}}lineBreak' or len(child) or child.text
                    for text in texts for child in text):
                continue
            units = sum(len(''.join(text.itertext()).encode('utf-16-le')) // 2 + len(text)
                for text in texts)
            positions = paragraph.xpath('./hp:linesegarray/hp:lineseg/@textpos', namespaces=NS)
            for value in positions:
                try:
                    overflow = int(value) > units
                except ValueError:
                    continue
                if overflow:
                    targets.append(target)
                    break
        return targets
