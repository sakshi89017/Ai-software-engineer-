export interface UploadedFile {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  created_at: string;
}

export interface UploadedFileWithContent extends UploadedFile {
  content: string;
}
