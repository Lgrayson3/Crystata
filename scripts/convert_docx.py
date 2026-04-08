#!/usr/bin/env python3
"""
DOCX-to-Markdown Converter

Converts .docx files to clean Markdown suitable for the lore extraction
pipeline. Handles:
  - Heading hierarchy (H1-H6)
  - Bold, italic, underline → Markdown equivalents
  - Bulleted and numbered lists
  - Tables → Markdown tables
  - Image extraction → assets/ sidecar directory
  - Stripping revision history, comments, and XML artifacts

Usage:
  python3 scripts/convert_docx.py ingest/raw/my-lore.docx
  python3 scripts/convert_docx.py ingest/raw/  # convert all .docx in dir

Output lands in ingest/processed/ with the same base filename.

Dependencies:
  pip install python-docx
"""

import sys
import os
import re
import hashlib
from pathlib import Path

try:
    from docx import Document
    from docx.opc.constants import RELATIONSHIP_TYPE as RT
except ImportError:
    print("ERROR: python-docx not installed. Run: pip install python-docx")
    sys.exit(1)

RAW_DIR = Path("ingest/raw")
PROCESSED_DIR = Path("ingest/processed")
ASSETS_DIR = Path("ingest/processed/assets")


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def extract_images(doc: Document, output_stem: str) -> dict[str, str]:
    """Extract embedded images, returning a map of rId → local file path."""
    image_dir = ASSETS_DIR / output_stem
    image_map = {}

    for rel in doc.part.rels.values():
        if "image" in rel.reltype:
            image_data = rel.target_part.blob
            ext = os.path.splitext(rel.target_part.partname)[1] or ".png"
            # Content-hash for deduplication
            content_hash = hashlib.sha256(image_data).hexdigest()[:12]
            filename = f"{content_hash}{ext}"
            filepath = image_dir / filename

            image_dir.mkdir(parents=True, exist_ok=True)
            filepath.write_bytes(image_data)
            image_map[rel.rId] = f"assets/{output_stem}/{filename}"

    return image_map


def para_to_markdown(para, image_map: dict) -> str:
    """Convert a single paragraph to Markdown."""
    style = para.style.name.lower() if para.style else ""

    # Headings
    if style.startswith("heading"):
        try:
            level = int(style.replace("heading", "").strip())
            level = min(max(level, 1), 6)
        except ValueError:
            level = 2
        return f"{'#' * level} {para.text.strip()}\n"

    # List items
    if style.startswith("list"):
        return f"- {para.text.strip()}"

    # Build inline formatting
    parts = []
    for run in para.runs:
        text = run.text
        if not text:
            continue
        if run.bold:
            text = f"**{text}**"
        if run.italic:
            text = f"*{text}*"
        if run.underline:
            text = f"<u>{text}</u>"
        parts.append(text)

    line = "".join(parts).strip()
    return line


def table_to_markdown(table) -> str:
    """Convert a docx table to a Markdown table."""
    rows = []
    for row in table.rows:
        cells = [cell.text.strip().replace("|", "\\|") for cell in row.cells]
        rows.append("| " + " | ".join(cells) + " |")

    if len(rows) >= 1:
        # Insert separator after header row
        col_count = len(table.rows[0].cells)
        separator = "| " + " | ".join(["---"] * col_count) + " |"
        rows.insert(1, separator)

    return "\n".join(rows)


def convert_docx(filepath: Path) -> str:
    """Convert a .docx file to clean Markdown."""
    doc = Document(str(filepath))
    stem = slugify(filepath.stem)
    image_map = extract_images(doc, stem)

    lines = []
    prev_blank = False

    for element in doc.element.body:
        tag = element.tag.split("}")[-1]  # strip namespace

        if tag == "p":
            from docx.text.paragraph import Paragraph
            para = Paragraph(element, doc)

            # Skip empty paragraphs (but preserve one blank line)
            if not para.text.strip():
                if not prev_blank:
                    lines.append("")
                    prev_blank = True
                continue

            md = para_to_markdown(para, image_map)
            if md:
                lines.append(md)
                prev_blank = False

        elif tag == "tbl":
            from docx.table import Table
            tbl = Table(element, doc)
            lines.append("")
            lines.append(table_to_markdown(tbl))
            lines.append("")
            prev_blank = False

    # Join and clean up
    content = "\n".join(lines)
    # Collapse 3+ newlines into 2
    content = re.sub(r"\n{3,}", "\n\n", content)
    # Strip trailing whitespace on each line
    content = "\n".join(line.rstrip() for line in content.split("\n"))

    return content.strip() + "\n"


def process_file(filepath: Path):
    """Convert a single .docx and write to processed/."""
    print(f"  Converting: {filepath.name}")
    content = convert_docx(filepath)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    output_path = PROCESSED_DIR / f"{slugify(filepath.stem)}.md"
    output_path.write_text(content, encoding="utf-8")
    print(f"  → {output_path}")

    return output_path


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/convert_docx.py <file.docx | directory>")
        sys.exit(1)

    target = Path(sys.argv[1])

    if target.is_file() and target.suffix == ".docx":
        process_file(target)
    elif target.is_dir():
        docx_files = sorted(target.glob("*.docx"))
        if not docx_files:
            print(f"No .docx files found in {target}")
            sys.exit(1)
        print(f"Found {len(docx_files)} .docx files")
        for f in docx_files:
            process_file(f)
    else:
        print(f"Error: {target} is not a .docx file or directory")
        sys.exit(1)

    print("\nConversion complete. Run the ingestion pipeline next:")
    print("  node scripts/ingest-pipeline.mjs")


if __name__ == "__main__":
    main()
