const extractBoundary = (contentType = "") => {
  const match = contentType.match(/boundary=([^;]+)/i);
  return match ? `--${match[1]}` : null;
};

const bufferToString = (buffer) => buffer.toString("binary");

const parseMultipartSingle = (buffer, boundary, fieldName) => {
  const parts = bufferToString(buffer)
    .split(boundary)
    .filter((part) => part.trim() && !part.endsWith("--"));

  const target = parts.find((part) => part.includes(`name="${fieldName}"`));
  if (!target) return null;

  const separatorIndex = target.indexOf("\r\n\r\n");
  if (separatorIndex === -1) return null;

  const headersPart = target.slice(0, separatorIndex);
  const bodyPart = target.slice(separatorIndex + 4);

  const bodyClean = bodyPart.replace(/\r\n--?$/, "");
  const fileBuffer = Buffer.from(bodyClean, "binary");

  const filenameMatch = headersPart.match(/filename="([^"]*)"/i);
  const mimeMatch = headersPart.match(/content-type:\s*([^\r\n]+)/i);

  return {
    fieldname: fieldName,
    originalname: filenameMatch?.[1] || "upload.jpg",
    mimetype: mimeMatch?.[1] || "application/octet-stream",
    buffer: fileBuffer,
    size: fileBuffer.length,
  };
};

export const createSimpleUpload = () => ({
  single(fieldName) {
    return (req, res, next) => {
      const contentType = req.headers["content-type"] || "";
      const boundary = extractBoundary(contentType);

      if (!boundary) {
        res.status(400).json({ error: "Formato multipart inválido." });
        return;
      }

      const chunks = [];

      req.on("data", (chunk) => chunks.push(chunk));
      req.on("error", (err) => next(err));
      req.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        const file = parseMultipartSingle(fullBuffer, boundary, fieldName);

        if (!file) {
          res.status(400).json({ error: "Imagem não encontrada no upload." });
          return;
        }

        req.file = file;
        next();
      });
    };
  },
});
