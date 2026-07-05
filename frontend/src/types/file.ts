export interface UploadedFile {
  id: string;
  user_id: string;
  filename: string;
  language: string;
  size: number;
  path: string;
  created_at: string;

  // Keep backward compatibility
  file_type: string;
  size_bytes: number;
}

export interface UploadedFileWithContent extends UploadedFile {
  content: string;
}
