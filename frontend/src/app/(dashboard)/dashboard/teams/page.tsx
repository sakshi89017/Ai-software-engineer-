"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Plus,
  Loader2,
  Mail,
  Shield,
  Activity,
  FolderPlus,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface SharedProject {
  id: string;
  repo_name: string;
  repo_owner: string;
  status: string;
  shared_at: string;
}

interface ActivityItem {
  id: string;
  user_email: string;
  activity_type: string;
  description: string;
  created_at: string;
}

interface TeamDetails {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
  shared_projects: SharedProject[];
  activities: ActivityItem[];
}

interface WorkspaceProject {
  id: string;
  repo_name: string;
  repo_owner: string;
  status: string;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDetails, setTeamDetails] = useState<TeamDetails | null>(null);
  const [myProjects, setMyProjects] = useState<WorkspaceProject[]>([]);
  
  // Loaders
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Form Inputs
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("collaborator");
  const [selectedProjectIdToShare, setSelectedProjectIdToShare] = useState("");

  const loadTeams = useCallback(async () => {
    try {
      const { data } = await apiClient.get<Team[]>("/api/teams");
      setTeams(data);
      if (data.length > 0 && !selectedTeamId) {
        setSelectedTeamId(data[0].id);
      }
    } catch {
      toast.error("Could not fetch team collaboration list.");
    } finally {
      setIsLoadingList(false);
    }
  }, [selectedTeamId]);

  const loadTeamDetails = useCallback(async (id: string) => {
    setIsLoadingDetails(true);
    try {
      const { data } = await apiClient.get<TeamDetails>(`/api/teams/${id}`);
      setTeamDetails(data);
    } catch {
      toast.error("Could not fetch team details.");
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  const loadMyProjects = useCallback(async () => {
    try {
      const { data } = await apiClient.get<WorkspaceProject[]>("/api/projects");
      setMyProjects(data);
    } catch {
      console.warn("Could not fetch user's projects to share.");
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadMyProjects();
  }, [loadTeams, loadMyProjects]);

  useEffect(() => {
    if (selectedTeamId) {
      loadTeamDetails(selectedTeamId);
    } else {
      setTeamDetails(null);
    }
  }, [selectedTeamId, loadTeamDetails]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    
    setIsCreatingTeam(true);
    try {
      const { data } = await apiClient.post<Team>("/api/teams", { name: newTeamName.trim() });
      setTeams((prev) => [data, ...prev]);
      setSelectedTeamId(data.id);
      setNewTeamName("");
      toast.success(`Team '${data.name}' created!`);
    } catch {
      toast.error("Failed to create team.");
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || !inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      await apiClient.post(`/api/teams/${selectedTeamId}/invitations`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole
      });
      setInviteEmail("");
      toast.success("Invitation sent successfully!");
      loadTeamDetails(selectedTeamId); // reload details
    } catch {
      toast.error("Failed to send invitation. Ensure email formatting is correct.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleShareProject = async () => {
    if (!selectedTeamId || !selectedProjectIdToShare) return;

    setIsSharing(true);
    try {
      await apiClient.post(`/api/teams/${selectedTeamId}/projects/${selectedProjectIdToShare}`);
      setSelectedProjectIdToShare("");
      toast.success("Project shared with team!");
      loadTeamDetails(selectedTeamId);
    } catch {
      toast.error("Failed to share project. Verify team owner permissions.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 bg-background select-none">
      
      {/* Left panel: Team list and create team */}
      <div className="w-full md:w-80 border border-border bg-card rounded-xl flex flex-col min-h-0 p-4 space-y-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Users className="h-4.5 w-4.5 text-primary" />
          <h2 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">My Teams</h2>
        </div>

        {/* Create Team Form */}
        <form onSubmit={handleCreateTeam} className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Create New Team</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name..."
              className="flex-1 min-w-0 rounded-lg border border-input bg-muted/10 px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button type="submit" size="sm" className="h-8 w-8 px-0" disabled={isCreatingTeam}>
              {isCreatingTeam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </form>

        {/* Team Items List */}
        <div className="flex-1 overflow-y-auto space-y-1">
          {isLoadingList ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic text-center py-4">No collaborative teams created yet.</p>
          ) : (
            teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg border text-xs font-semibold transition-all hover:bg-accent/40 flex items-center justify-between",
                  selectedTeamId === t.id
                    ? "bg-primary/10 border-primary/20 text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{t.name}</span>
                <Users className="h-3.5 w-3.5 opacity-60" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel: Details view */}
      <div className="flex-1 border border-border bg-card rounded-xl flex flex-col min-h-0 shadow-sm overflow-hidden select-text">
        {isLoadingDetails ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : teamDetails ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-6 space-y-6">
            
            {/* Header */}
            <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 select-none">
              <div>
                <h3 className="font-bold text-lg text-foreground">{teamDetails.name}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Created on {new Date(teamDetails.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Split Grid: Members (left) & Actions/Feeds (right) */}
            <div className="grid gap-6 md:grid-cols-2 items-start">
              
              {/* Left Column: Members List */}
              <div className="space-y-4 border border-border/75 rounded-lg p-4 bg-muted/5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                    <Shield className="h-4 w-4 text-primary" /> Members
                  </h4>
                  <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-bold select-none">{teamDetails.members.length} members</span>
                </div>
                
                <div className="space-y-2">
                  {teamDetails.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-lg border border-border/50 bg-card text-xs">
                      <div>
                        <p className="font-semibold text-foreground">{m.email}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          Joined {new Date(m.joined_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase select-none tracking-wider",
                        m.role === "owner" ? "bg-amber-500/10 text-amber-500" : m.role === "admin" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                      )}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Invite Collaborator */}
              <div className="space-y-4 border border-border/75 rounded-lg p-4 bg-muted/5">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                  <UserPlus className="h-4.5 w-4.5 text-primary" /> Invite Member
                </h4>

                <form onSubmit={handleInvite} className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold select-none">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="collaborator@example.com"
                        className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold select-none">Role Permission</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="w-full rounded-lg border border-input bg-card px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="admin">Admin</option>
                        <option value="collaborator">Collaborator</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                    
                    <Button type="submit" size="sm" className="h-9 w-full font-semibold select-none" disabled={isInviting}>
                      {isInviting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                      Send Invitation
                    </Button>
                  </div>
                </form>

                {/* Sent Invitations List */}
                {teamDetails.invitations.length > 0 && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none">Pending Invitations</label>
                    <div className="space-y-1.5">
                      {teamDetails.invitations.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between text-[11px] bg-card/50 p-2 rounded-lg border border-border/40">
                          <span className="font-semibold text-foreground/80">{inv.email}</span>
                          <span className="text-[9px] px-1 bg-muted rounded font-semibold uppercase">{inv.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Shared Projects List */}
            <div className="border border-border/75 rounded-lg p-4 bg-muted/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                  <FolderPlus className="h-4.5 w-4.5 text-primary" /> Shared Projects
                </h4>

                {/* Share Project Form */}
                <div className="flex items-center gap-2 select-none">
                  <select
                    value={selectedProjectIdToShare}
                    onChange={(e) => setSelectedProjectIdToShare(e.target.value)}
                    className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select project to share...</option>
                    {myProjects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.repo_owner}/{proj.repo_name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" className="h-8" onClick={handleShareProject} disabled={isSharing || !selectedProjectIdToShare}>
                    {isSharing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    Share
                  </Button>
                </div>
              </div>

              {teamDetails.shared_projects.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic select-none">No projects shared with this team yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {teamDetails.shared_projects.map((proj) => (
                    <div key={proj.id} className="p-3 bg-card rounded-lg border border-border/60 hover:border-primary/20 transition-all flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-foreground">{proj.repo_name}</h5>
                        <p className="text-[9px] text-muted-foreground mt-0.5">Owner: {proj.repo_owner}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => window.open(`/dashboard/projects?projectId=${proj.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collaboration Activity Feed */}
            <div className="border border-border/75 rounded-lg p-4 bg-muted/5 space-y-4">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 select-none">
                <Activity className="h-4.5 w-4.5 text-primary" /> Activity Feed
              </h4>

              <div className="space-y-3">
                {teamDetails.activities.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground italic select-none">No team activity logged yet.</p>
                ) : (
                  teamDetails.activities.map((act) => (
                    <div key={act.id} className="flex gap-3 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-foreground/90 font-medium">{act.description}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {new Date(act.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
            <Users className="h-10 w-10 text-primary/40 mb-3 stroke-[1.2]" />
            <h5 className="font-semibold text-sm text-foreground/90">Select a Team</h5>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Choose a team from the list on the left or create a new team to manage members, invitations, and shared repository code.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
