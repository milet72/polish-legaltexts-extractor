import mupdf from "mupdf";

// Synthetic backend contract fixture; not representative gazette ground truth.
export function createPdf() {
	const buffer = new mupdf.Buffer();
	const writer = new mupdf.DocumentWriter(buffer, "pdf", "");
	const normal = new mupdf.Font("Times-Roman");
	const bold = new mupdf.Font("Times-Bold");
	const italic = new mupdf.Font("Times-Italic");
	const stroke = new mupdf.StrokeState({ lineCap: "Butt", lineJoin: "Miter", lineWidth: 0.5, miterLimit: 10 });
	try {
		for (let index = 0; index < 2; index++) {
			const device = writer.beginPage([0, 0, 240, 180]);
			const text = new mupdf.Text();
			const path = new mupdf.Path();
			try {
				text.showString(bold, [12, 0, 0, -12, 20, 25], "Backend proof of concept");
				text.showString(normal, [10, 0, 0, -10, 20, 45], "Załącznik: Łódź, żółć");
				text.showString(italic, [10, 0, 0, -10, 20, 60], "Italic text");
				text.showString(normal, [6, 0, 0, -6, 70, 55], "2");
				text.showString(normal, [6, 0, 0, -6, 80, 64], "3");
				device.fillText(text, mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, [0], 1);
				for (const [x0, y0, x1, y1] of [
					[20, 62, 60, 62], [20, 150, 75, 150],
					[20, 80, 180, 80], [20, 100, 180, 100], [20, 120, 180, 120],
					[20, 80, 20, 120], [100, 80, 100, 120], [180, 80, 180, 120],
				]) {
					path.moveTo(x0, y0);
					path.lineTo(x1, y1);
				}
				device.strokePath(path, stroke, mupdf.Matrix.identity, mupdf.ColorSpace.DeviceGray, [0], 1);
				if (index === 1) {
					const square = new mupdf.Path();
					try {
						square.rect(190, 100, 220, 130);
						device.fillPath(square, false, mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, [1, 0, 0], 1);
					} finally {
						square.destroy();
					}
				}
			} finally {
				path.destroy();
				text.destroy();
				device.destroy();
			}
			writer.endPage();
		}
		writer.close();
		return Buffer.from(buffer.asUint8Array());
	} finally {
		stroke.destroy();
		italic.destroy();
		bold.destroy();
		normal.destroy();
		writer.destroy();
		buffer.destroy();
	}
} // createPdf()
