import multer from 'multer';
import { isAllowedUploadMime } from './fileAttachments.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB per file (chat attachments — images + docs)

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

/** Media create/edit — accepts all common attachment field names from web + mobile */
export const uploadMediaReferences = upload.fields([
  { name: 'files', maxCount: 5 },
  { name: 'referenceImages', maxCount: 5 },
  { name: 'images', maxCount: 5 },
  { name: 'referenceImage', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);
