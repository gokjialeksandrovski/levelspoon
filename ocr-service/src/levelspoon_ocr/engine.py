"""PaddleOCR wrapper - the only impure module in this package.

Every other module is a pure function over Box objects, which is what lets
the parsing core be tested without a 133MB model. Keep it that way: no
parsing logic belongs here, and nothing here belongs in a unit test.

Doc-orientation, unwarping and textline-orientation correction are disabled:
these are upright photographs, not scanned documents, and each adds latency
for no accuracy benefit on this input.
"""

import io
from dataclasses import dataclass

import numpy
from PIL import Image

from .boxes import Box, OcrResult


@dataclass
class OcrEngine:
    """Holds one warm PaddleOCR instance for the process's lifetime."""

    lang: str = "en"

    def __post_init__(self) -> None:
        from paddleocr import PaddleOCR

        self._ocr = PaddleOCR(
            lang=self.lang,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=True,
        )

    @property
    def model_loaded(self) -> bool:
        return getattr(self, "_ocr", None) is not None

    def read(self, image_bytes: bytes) -> OcrResult:
        """Detect every text box in one photograph."""
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = image.size

        boxes: list[Box] = []
        for prediction in self._ocr.predict(numpy.array(image)):
            for text, poly, score in zip(
                prediction["rec_texts"],
                prediction["rec_polys"],
                prediction["rec_scores"],
            ):
                xs = [point[0] for point in poly]
                ys = [point[1] for point in poly]
                boxes.append(
                    Box(
                        text=text,
                        x=(min(xs) + max(xs)) / 2,
                        y=(min(ys) + max(ys)) / 2,
                        confidence=float(score),
                    )
                )

        return OcrResult(boxes=tuple(boxes), image_width=width, image_height=height)
