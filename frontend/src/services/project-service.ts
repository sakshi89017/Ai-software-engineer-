import { apiClient } from "@/lib/api-client";
import type { Project, ProjectDetail, ProjectFile } from "@/types/project";

export const projectService = {
  async importGithub(repoUrl: string): Promise<Project> {
    const { data } = await apiClient.post<Project>("/api/github/import", { repo_url: repoUrl });
    return data;
  },

  async list(): Promise<Project[]> {
    const { data } = await apiClient.get<Project[]>("/api/projects");
    return data;
  },

  async getDetail(projectId: string): Promise<ProjectDetail> {
    const { data } = await apiClient.get<ProjectDetail>(`/api/projects/${projectId}`);
    return data;
  },

  async getFile(fileId: string): Promise<ProjectFile> {
    const { data } = await apiClient.get<ProjectFile>(`/api/projects/files/${fileId}`);
    return data;
  },

  async remove(projectId: string): Promise<void> {
    await apiClient.delete(`/api/projects/${projectId}`);
  },
};
