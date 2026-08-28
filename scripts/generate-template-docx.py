#!/usr/bin/env python3
"""Generates the PaperMind document templates as minimal valid .docx files.

Each template is a small OOXML package with direct formatting only (no
styles.xml / numbering.xml), which keeps them parse-safe for the editor.
Run: python3 scripts/generate-template-docx.py
"""

import os
from xml.sax.saxutils import escape
import zipfile

OUT_DIR = os.path.join("assets", "documents", "templates")

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def para(text="", bold=False, size=None, color=None, align=None, space_after=None):
    ppr = ""
    if align:
        ppr += f'<w:jc w:val="{align}"/>'
    if space_after is not None:
        ppr += f'<w:spacing w:after="{space_after}"/>'
    ppr_xml = f"<w:pPr>{ppr}</w:pPr>" if ppr else ""
    if not text:
        return f"<w:p>{ppr_xml}</w:p>"
    rpr = ""
    if bold:
        rpr += "<w:b/>"
    if size:
        rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    if color:
        rpr += f'<w:color w:val="{color}"/>'
    rpr_xml = f"<w:rPr>{rpr}</w:rPr>" if rpr else ""
    return (
        f"<w:p>{ppr_xml}<w:r>{rpr_xml}"
        f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    )


def document_xml(body_paragraphs):
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f"<w:body>{''.join(body_paragraphs)}"
        "<w:sectPr>"
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
        'w:header="720" w:footer="720" w:gutter="0"/>'
        "</w:sectPr></w:body></w:document>"
    )


def write_docx(name, paragraphs):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document_xml(paragraphs))
    print(f"wrote {path} ({os.path.getsize(path)} bytes)")


GRAY = "595959"

write_docx("report.docx", [
    para("Report Title", bold=True, size=56, align="center", space_after=120),
    para("Subtitle or author name", size=28, color=GRAY, align="center", space_after=480),
    para("1. Introduction", bold=True, size=32, space_after=120),
    para("Write your introduction here."),
    para(),
    para("2. Findings", bold=True, size=32, space_after=120),
    para("Summarize your findings here."),
    para(),
    para("3. Conclusion", bold=True, size=32, space_after=120),
    para("Wrap up your report here."),
])

write_docx("letter.docx", [
    para("Date", space_after=480),
    para("Recipient Name"),
    para("Street Address"),
    para("City, State ZIP", space_after=480),
    para("Dear Recipient,", space_after=240),
    para("Write the body of your letter here."),
    para(),
    para("Sincerely,", space_after=480),
    para("Your Name"),
])

write_docx("resume.docx", [
    para("Your Name", bold=True, size=48, align="center", space_after=60),
    para("City · email@example.com · (555) 000-0000", size=22, color=GRAY, align="center", space_after=360),
    para("EXPERIENCE", bold=True, size=28, space_after=120),
    para("Job Title — Company", bold=True),
    para("Dates employed"),
    para("Describe what you did and achieved."),
    para(),
    para("EDUCATION", bold=True, size=28, space_after=120),
    para("Degree — Institution"),
    para("Dates attended"),
    para(),
    para("SKILLS", bold=True, size=28, space_after=120),
    para("List your key skills."),
])

write_docx("notes.docx", [
    para("Notes", bold=True, size=40, space_after=120),
    para("Date:", color=GRAY, space_after=240),
    para(),
    para(),
    para(),
])
