/** Real PDF fixture with XObject reuse, clipping, inline image and a Form-contained image. */
export function imagePdfBytes(options: { includeInline?: boolean; rotation?: 0 | 90 } = {}): Buffer {
  const includeInline = options.includeInline ?? true;
  const rotation = options.rotation ?? 90;
  const pageContent = [
    "q",
    "50 50 100 100 re W n",
    "100 0 0 100 50 50 cm",
    "/Im1 Do",
    "Q",
    "q",
    "80 0 0 80 200 50 cm",
    "/Im1 Do",
    "Q",
    ...(includeInline ? [
      "q",
      "50 0 0 50 320 50 cm",
      "BI /W 1 /H 1 /CS /RGB /BPC 8 /F /AHx ID 00FF00> EI",
      "Q",
    ] : []),
    "q",
    "1 0 0 1 100 300 cm",
    "/Fm1 Do",
    "Q",
  ].join("\n");
  const formContent = "q 60 0 0 60 0 0 cm /Im1 Do Q";
  const imageData = "FF0000>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /Rotate ${rotation} /MediaBox [0 0 600 800] /Resources << /XObject << /Im1 5 0 R /Fm1 6 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(pageContent)} >>\nstream\n${pageContent}\nendstream`,
    `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${Buffer.byteLength(imageData)} >>\nstream\n${imageData}\nendstream`,
    `<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /Im1 5 0 R >> >> /Length ${Buffer.byteLength(formContent)} >>\nstream\n${formContent}\nendstream`,
  ];

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
