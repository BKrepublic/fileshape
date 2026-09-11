/** Small real PDF exercising the production PDF.js-to-EPUB path without the private corpus. */
export function pdfBytes(options: { outline?: boolean } = {}): Buffer {
  const content = "BT /F1 20 Tf 1 0 0 1 100 500 Tm (Wi,) Tj ET\nBT /F1 10 Tf 1 0 0 1 101 516 Tm (abc) Tj ET";
  const objects = [
    options.outline
      ? "<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R /Names << /Dests << /Names [(named-start) [3 0 R /Fit]] >> >> >>"
      : "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  if (options.outline) objects.push(
    "<< /Type /Outlines /First 7 0 R /Last 10 0 R /Count 4 >>",
    "<< /Title (Part & One) /Parent 6 0 R /First 8 0 R /Last 9 0 R /Count 2 /Next 10 0 R >>",
    "<< /Title (Section <One>) /Parent 7 0 R /Dest [3 0 R /XYZ 0 800 null] /Next 9 0 R >>",
    "<< /Title (Named section) /Parent 7 0 R /Dest (named-start) /Prev 8 0 R >>",
    "<< /Title (External entry) /Parent 6 0 R /Prev 7 0 R /A << /S /URI /URI (https://example.invalid/) >> >>",
  );
  let text = "%PDF-1.7\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text);
}
