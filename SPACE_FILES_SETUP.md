# Space Files Feature - Setup Guide

## ✅ What's New

Added file upload and sharing to Spaces! Now users can:
- Upload files to their spaces
- View all files in a space
- Download files from shared spaces
- Delete files they uploaded
- Share files with anyone who has access to the space (public/community spaces)

---

## 🚀 Setup (2 Steps)

### Step 1: Run Database Migration

Go to Supabase Dashboard → SQL Editor and run:

```sql
-- Add space_files table for file uploads in spaces
CREATE TABLE IF NOT EXISTS space_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_space_files_space_id ON space_files(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_space_files_user_id ON space_files(user_id, created_at DESC);

-- Add RLS policies
ALTER TABLE space_files ENABLE ROW LEVEL SECURITY;

-- Users can view files in their own spaces
CREATE POLICY "Users can view files in their own spaces"
  ON space_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );

-- Users can view files in public spaces
CREATE POLICY "Users can view files in public spaces"
  ON space_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.is_public = true
    )
  );

-- Users can upload files to their own spaces
CREATE POLICY "Users can upload files to their own spaces"
  ON space_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );

-- Users can delete files from their own spaces
CREATE POLICY "Users can delete files from their own spaces"
  ON space_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM spaces 
      WHERE spaces.id = space_files.space_id 
      AND spaces.user_id = auth.uid()
    )
  );
```

### Step 2: Restart Server

```bash
# Backend changes are complete, just restart:
cd server
npm run dev
```

---

## 📋 Features

### File Upload
- **Supported Types**: Images, PDF, Word, Excel, Text, CSV, JSON, ZIP
- **Max Size**: 10MB per file
- **Storage**: Supabase Storage (`files` bucket - already exists!)
- **Access**: Only space owners can upload files

### File Sharing
- **Private Spaces**: Only owner can see files
- **Public Spaces**: Anyone can view and download files
- **Delete**: Only space owner can delete files

### UI Features
- Click "Files" button to expand/collapse file list
- Upload button (only for space owners)
- Download button for all files
- Delete button (only for space owners)
- Shows file name, size, and upload date

---

## 🎯 How It Works

### For Space Owners:
1. Open your space
2. Click "Files" to see uploaded files
3. Click "+ Upload" to add new files
4. Select any file (up to 10MB)
5. File is uploaded and stored
6. File appears in the files list

### For Public Space Visitors:
1. Open a public space
2. Click "Files" to see available files
3. Click download icon to get any file
4. Cannot upload or delete (view-only)

### Sharing Flow:
```
1. Owner uploads file to space
   ↓
2. File stored in Supabase Storage
   ↓
3. File metadata saved to database
   ↓
4. If space is public → File visible to everyone
   ↓
5. If space is private → Only owner can see
```

---

## 📊 Database Schema

### space_files Table
```sql
- id: UUID (primary key)
- space_id: UUID (references spaces)
- user_id: UUID (uploader)
- file_name: TEXT (original filename)
- file_url: TEXT (public URL)
- file_type: TEXT (MIME type)
- file_size: BIGINT (bytes)
- created_at: TIMESTAMP
```

### Storage
- **Bucket**: `files` (already exists)
- **Path**: `space-files/{spaceId}/{timestamp}-{random}-{filename}`
- **Access**: Public URLs (RLS controlled via database)

---

## 🔒 Security

### RLS Policies
✅ Users can only upload to their own spaces  
✅ Users can view files in their own spaces  
✅ Users can view files in public spaces  
✅ Users can only delete from their own spaces  
✅ Space owners control file access via space visibility  

### File Validation
✅ File type checking (allowed types only)  
✅ File size limit (10MB max)  
✅ Unique filenames (timestamp + random)  
✅ Ownership verification before delete  

---

## 🐛 Troubleshooting

### "Failed to upload file"
- Check file size (must be < 10MB)
- Check file type (see supported types above)
- Ensure you're the space owner
- Check Supabase Storage has space

### "Files not showing"
- Make sure database migration was applied
- Refresh the page
- Check browser console for errors

### "Access denied" when viewing public space
- File RLS policies may not be set correctly
- Rerun the migration SQL
- Check space is actually public (`is_public = true`)

---

## 💡 Tips

1. **Organize Files**: Use clear filenames - they can't be renamed later
2. **Share Documents**: Great for team collaboration in public spaces
3. **Reference Images**: Upload reference images for AI chats in that space
4. **Resource Library**: Create public spaces as resource libraries
5. **Clean Up**: Delete old files to save storage space

---

## 📝 API Endpoints

### Upload File
```
POST /api/spaces/:id/upload-file
Body: FormData with 'file' field
Auth: Required (space owner only)
```

### Get Files
```
GET /api/spaces/:id/files
Auth: Required (owner or public space)
```

### Delete File
```
DELETE /api/spaces/:spaceId/files/:fileId
Auth: Required (space owner only)
```

---

## ✅ Summary

**Files Changed:**
- `server/database/add_space_files.sql` - NEW migration
- `server/src/routes/spaces.ts` - Added file endpoints
- `src/pages/SpacesPage.tsx` - Added file UI

**Database:**
- New table: `space_files`
- 2 indexes for performance
- 4 RLS policies for security

**Storage:**
- Uses existing `files` bucket
- No new bucket needed!

**No Changes Required:**
- ❌ No .env changes
- ❌ No API keys
- ❌ No package updates

---

## 🎉 You're Done!

1. Run the SQL migration
2. Restart server
3. Open a space
4. Click "Files" and start uploading!

Files are automatically shared based on space visibility (private/public).
