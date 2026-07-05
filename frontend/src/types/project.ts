export interface Project {
  id: string;
  user_id: string;
  repo_name: string | null;
  repo_owner: string | null;
  repo_url: string;
  default_branch: string | null;
  languages: string | null;
  framework: string | null;
  total_files: number;
  total_lines: number;
  size_bytes: number;
  last_commit_sha: string | null;
  last_commit_message: string | null;
  last_commit_author: string | null;
  last_commit_date: string | null;
  status: "pending" | "cloning" | "indexing" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
}

export interface ProjectFileTreeItem {
  id: string;
  file_path: string;
  filename: string;
  size_bytes: number;
  language: string | null;
}

export interface ProjectDetail extends Project {
  files: ProjectFileTreeItem[];
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_path: string;
  filename: string;
  size_bytes: number;
  content: string;
  language: string | null;
  created_at: string;
}
