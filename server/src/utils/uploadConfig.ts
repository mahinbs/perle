import multer from 'multer';
import { isAllowedUploadMime } from './fileAttachments.js';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB per file

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'File type not supported. Allowed: images, PDF, Word, Excel, CSV, plain text'
        )
      );
    }
  },
});

/** Multi-file + legacy single `image` + legacy `images` (deployed frontend) */
export const uploadSearchFiles = upload.fields([
  { name: 'files', maxCount: 20 },
  { name: 'images', maxCount: 20 },
  { name: 'image', maxCount: 1 },
]);
