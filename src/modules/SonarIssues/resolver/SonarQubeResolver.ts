import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";
import { LocReport } from "../graphql/types/LocReport";
import { Branch } from "../../branch/entity/branch.entity";
import { Repo } from "../../GitHubRepository/entity/Repo.entity";
import { QueryRunner } from "typeorm";
import { ProjectAnalysisResult } from "../graphql/types/projectAnalysisResult.type";
import axios from "axios";
import { exec} from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { SonarIssue } from "../entity/SonarIssue.entity";
import { LanguageBytesPerLineEntity } from "../../LanguageBytesPerLine/entity/languageBytesPerLine.entity";
const execAsync = promisify(exec);
import * as fs from "fs";


import util from "util";

const execPromise = util.promisify(exec);

dotenv.config();

const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_API_TOKEN = process.env.SONARQUBE_API_TOKEN;
const GITHUB_API_URL = process.env.GITHUB_API;
@Resolver()
export class SonarQubeResolver {
  private readonly projectRepo = dataSource.getRepository(Project);
  private readonly userRepo = dataSource.getRepository(User);
  private readonly metricsRepo = dataSource.getRepository(CodeMetrics);
  private readonly issuesRepo = dataSource.getRepository(SonarIssue);
  private readonly branchRepo = dataSource.getRepository(Branch);
  private readonly repoDetail = dataSource.getRepository(Repo);
  @Query(() => ProjectAnalysisResult)
async getProjectAnalysis(
  @Arg("githubUsername") githubUsername: string,
  @Arg("repoName") repoName: string,
  @Arg("branch", { nullable: true }) branch?: string
) {
  try {
    const projectKey = `${githubUsername}_${repoName.trim()}`.replace(/[^a-zA-Z0-9_-]/g, "_");

    const project = await this.projectRepo.findOne({
      where: { repoName: projectKey, user: { username: githubUsername } },
      relations: ["user"],
    });

    if (!project) {
      throw new Error(`Project '${repoName}' not found in the database.`);
    }

    const user = await this.userRepo.findOne({
      where: { username: githubUsername },
      select: ["u_id", "githubAccessToken"],
    });

    if (!user || !user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

    const repoDetails = await axios.get(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName.trim()}`,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    const defaultBranch = repoDetails.data.default_branch || "main";
    type BranchInfo = {
      name: string;
      dashboardUrl?: string;
    };
    
    let branches: BranchInfo[] = [];
    

    try {
      const branchResponse = await axios.get(
        `${GITHUB_API_URL}/repos/${githubUsername}/${repoName.trim()}/branches`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const branchRepo = dataSource.getRepository(Branch);
      branches = await branchRepo.find({
     where: {
    repoName: project.title,
    username: githubUsername,
  },
  select: ['name', 'dashboardUrl'],
  });

    } catch {
      branches = [{ name: defaultBranch, dashboardUrl: "" }];
    }

    const validatedBranch =
      branch && branches.some((b) => b.name === branch) ? branch : defaultBranch;

      const [codeMetrics, sonarIssues, locReport] = await Promise.all([
        this.metricsRepo.find({
          where: {
            repoName: repoName.trim(),
            username: githubUsername,
            branch: validatedBranch,
          },
        }),
        this.issuesRepo.find({
          where: {
            repoName: repoName.trim(),
            username: githubUsername,
            branch: validatedBranch,
          },
        }),
        this.getLinesOfCodeReport(githubUsername, repoName.trim(), validatedBranch),
      ]);
      
    console.log(branches,project,locReport,codeMetrics,sonarIssues,"Responses");
    return {
      project,
      branches,
      codeMetrics,
      sonarIssues,
      locReport,
    };
  } catch (error) {
    console.error("Error in getProjectAnalysis:", error);
    throw new Error(
      error instanceof Error
        ? `Failed to analyze project: ${error.message}`
        : "Failed to analyze project due to an unknown error."
    );
  }
}

  
  @Query(() => [Branch])
  async getRepoBranches(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ) {
    try {
      const cleanedRepoName = repoName.replace(`${githubUsername}/`, "");
      const user = await this.userRepo.findOne({ where: { username: githubUsername } });
      if (!user || !user.githubAccessToken) {
        throw new Error("GitHub access token not found.");
      }

      const response = await axios.get(
        `${GITHUB_API_URL}/repos/${githubUsername}/${cleanedRepoName}/branches`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!response.data || response.data.length === 0) {
        return [{ name: "master" }];
      }

      return response.data.map((branch: any) => ({ name: branch.name }));
    } catch (error: any) {
      throw new Error("Failed to fetch branches from GitHub.");
    }
  }


  @Mutation(() => String)
async triggerAutomaticAnalysis(
  @Arg("githubUsername") githubUsername: string
): Promise<string> {
  try {
    const user = await this.userRepo.findOne({
      where: { username: githubUsername },
      select: ["u_id", "username", "githubAccessToken"]
    });

    if (!user) throw new Error(`User ${githubUsername} not found`);
    if (!user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

    const reposResponse = await fetch(`${GITHUB_API_URL}/users/${githubUsername}/repos`, {
      headers: { Authorization: `Bearer ${user.githubAccessToken}` },
    });

    if (!reposResponse.ok) throw new Error("Failed to fetch repositories.");

    const repositories = await reposResponse.json();

    for (const repo of repositories) {
      await this.analyzeRepository(user, repo);
    }

    return `SonarQube analysis triggered for all repositories of ${githubUsername}`;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}



@Mutation(() => AnalysisResult)
async triggerBranchAnalysisIfPROpen(
  @Arg("githubUsername") githubUsername: string,
  @Arg("repoName") repoName: string,
  @Arg("branchName") branchName: string
): Promise<AnalysisResult> {
  try {
    const user = await this.userRepo.findOne({
      where: { username: githubUsername },
      select: ["u_id", "username", "githubAccessToken"]
    });

    if (!user) throw new Error(`User ${githubUsername} not found`);
    if (!user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

    
    const branchResponse = await fetch(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/branches/${branchName}`,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json"
        }
      }
    );

    if (!branchResponse.ok) {
      throw new Error(`Branch ${branchName} not found in repository ${repoName}`);
    }

    const prsResponse = await fetch(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/pulls?state=open&head=${githubUsername}:${branchName}`,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json"
        }
      }
    );

    const prs = await prsResponse.json();

    if (!Array.isArray(prs) || prs.length === 0) {
      return {
        success: false,
        message: `No open pull request found for branch '${branchName}'`
      };
    }

    const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;
    const projectKey = `${githubUsername}_${repoName}_${branchName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const projectName = `${repoName}-${branchName}`;

    let project = await this.projectRepo.findOne({
      where: { repoName: `${githubUsername}_${repoName}` },
      relations: ["user"]
    });

    if (!project) {
      const repoResponse = await fetch(
        `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          }
        }
      );

      if (!repoResponse.ok) {
        throw new Error(`Repository ${repoName} not found`);
      }

      const repo = await repoResponse.json();
      const locData = await this.getRepositoryLinesOfCode(user, repo);

      project = this.projectRepo.create({
        title: repo.name,
        repoName: `${githubUsername}_${repo.name}`,
        description: repo.description || `Analysis for ${repo.name}`,
        githubUrl: repo.html_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || 'main',
        user,
        estimatedLinesOfCode: locData.totalLines,
        languageDistribution: locData.languages,
        username: user.username,
        analysisStartTime: new Date(),
        result: "In Progress"
      });

      await this.projectRepo.save(project);
    }

    await this.cleanBranch(project.u_id, branchName);

    let repoPath: string | null = null;
    try {
      repoPath = await this.cloneRepository(project.githubUrl, branchName);

      this.createSonarPropertiesFile(repoPath, projectKey, projectName, branchName);
      await this.runSonarScanner(repoPath, branchName);
      await this.waitForProjectAnalysis(projectKey, authHeader, branchName);
      await this.storeAnalysisResults(project, branchName, authHeader);

      const repo = await this.repoDetail.findOne({ where: { name: project.title } });
      if (!repo) throw new Error("Repo not found");

      const branchEntity = this.branchRepo.create({
        name: branchName,
        repoName: project.title,
        username: user.username,
        repo: repo,
        user: user
      });

      await this.branchRepo.save(branchEntity);

      return {
        success: true,
        message: `Successfully analyzed branch ${branchName} of repository ${repoName}`
      };
    } catch (error) {
      console.error(`Analysis failed for branch ${branchName}:`, error);
      return {
        success: false,
        message: `Analysis failed for branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      if (repoPath) {
        await this.cleanupRepository(repoPath);
      }
    }
  } catch (error) {
    console.error("Error in triggerBranchAnalysisIfPROpen:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}


@Mutation(() => AnalysisResult)
async analyzeSingleRepository(
  @Arg("githubUsername") githubUsername: string,
  @Arg("repoName") repoName: string
): Promise<AnalysisResult> {
  try {
    const user = await this.userRepo.findOne({
      where: { username: githubUsername },
      select: ["u_id", "username", "githubAccessToken"]
    });

    if (!user) throw new Error(`User ${githubUsername} not found`);
    if (!user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

    let repo;
    try {
      const repoResponse = await fetch(
        `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          },
          signal: AbortSignal.timeout(10000) // 10 second timeout
        }
      );

      if (!repoResponse.ok) {
        const errorData = await repoResponse.json();
        throw new Error(`GitHub API error: ${repoResponse.status} - ${errorData.message}`);
      }

      repo = await repoResponse.json();
    } catch (error:any) {
      if (error.name === 'AbortError') {
        throw new Error('GitHub API request timed out');
      }
      throw new Error(`Failed to fetch repository: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!repo?.html_url || repo.html_url.includes('github.com/default')) {
      throw new Error(`Invalid repository URL received: ${repo?.html_url}`);
    }

    try {
      await this.analyzeRepository(user, repo);
      return {
        success: true,
        message: `Successfully analyzed repository ${repoName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message
    };
  }
}

private async analyzeRepository(user: User, repo: any) {
  const projectKey = `${user.username}_${repo.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;

  let locData;
  try {
    locData = await this.getRepositoryLinesOfCode(user, repo);
  } catch (error) {
    throw new Error(`Failed to get lines of code: ${error instanceof Error ? error.message : String(error)}`);
  }

  let project = await this.projectRepo.findOne({
    where: { repoName: projectKey },
    relations: ["codeMetrics"]
  });

  const analysisStartTime = new Date();

  if (!project) {
    project = this.projectRepo.create({
      title: repo.name,
      repoName: projectKey,
      description: repo.description || `Analysis for ${repo.name}`,
      githubUrl: repo.html_url,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch || 'main',
      user,
      estimatedLinesOfCode: locData.totalLines,
      languageDistribution: locData.languages,
      username: user.username,
      analysisStartTime,
      result: "In Progress"
    });
  } else {
    project.githubUrl = repo.html_url;
    project.isPrivate = repo.private;
    project.defaultBranch = repo.default_branch || 'main';
    project.estimatedLinesOfCode = locData.totalLines;
    project.languageDistribution = locData.languages;
    project.analysisStartTime = analysisStartTime;
    project.result = "In Progress";

    if (project.codeMetrics) {
      await this.metricsRepo.remove(project.codeMetrics);
    }
  }

  try {
    await this.projectRepo.save(project);
  } catch (error) {
    throw new Error(`Failed to save project: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    console.log("Starting SonarQube Configuration...");
    await this.configureSonarQubeProject(user, project, repo, authHeader);
    console.log("Configuration done. Starting Analysis...");
  
    try {
      await this.triggerSonarQubeAnalysis(user, project, repo, authHeader);
      console.log("Analysis triggered successfully.");
    } catch (error) {
      console.error("Error triggering SonarQube Analysis:", error);
      
      throw error;
    }
  
    const analysisEndTime = new Date();
    project.result = "Analysis completed";
    project.analysisEndTime = analysisEndTime;
    project.analysisDuration = Math.floor(
      (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
    );
    project.lastAnalysisDate = new Date();
  
    await this.projectRepo.save(project);
    console.log("Project updated with analysis result.");
  } catch (error) {
    console.error("Outer catch - analysis failed:", error);
  
    const analysisEndTime = new Date();
    project.result = "Analysis failed";
    project.analysisEndTime = analysisEndTime;
    project.analysisDuration = Math.floor(
      (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
    );
  
    try {
      await this.projectRepo.save(project);
      console.log("Saved failed analysis status.");
    } catch (saveError) {
      console.error('Failed to save failed analysis state:', saveError);
    }
  
    throw error;
  }
  
}

@Mutation(() => AnalysisResult)
async triggerBranchAnalysis(
  @Arg("githubUsername") githubUsername: string,
  @Arg("repoName") repoName: string,
  @Arg("branchName") branchName: string
): Promise<AnalysisResult> {
  try {
    const user = await this.userRepo.findOne({
      where: { username: githubUsername },
      select: ["u_id", "username", "githubAccessToken"]
    });

    if (!user) throw new Error(`User ${githubUsername} not found`);
    if (!user.githubAccessToken) {
      throw new Error(`GitHub access token not found for user ${githubUsername}`);
    }

   
    const branchResponse = await fetch(
      `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}/branches/${branchName}`,
      {
        headers: {
          Authorization: `Bearer ${user.githubAccessToken}`,
          Accept: "application/vnd.github.v3+json"
        }
      }
    );

    if (!branchResponse.ok) {
      throw new Error(`Branch ${branchName} not found in repository ${repoName}`);
    }

    const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;
    const projectKey = `${githubUsername}_${repoName}_${branchName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const projectName = `${repoName}-${branchName}`;

    
    let project = await this.projectRepo.findOne({
      where: { repoName: `${githubUsername}_${repoName}` },
      relations: ["user"]
    });

    if (!project) {
      const repoResponse = await fetch(
        `${GITHUB_API_URL}/repos/${githubUsername}/${repoName}`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          }
        }
      );

      if (!repoResponse.ok) {
        throw new Error(`Repository ${repoName} not found`);
      }

      const repo = await repoResponse.json();
      const locData = await this.getRepositoryLinesOfCode(user, repo);

      project = this.projectRepo.create({
        title: repo.name,
        repoName: `${githubUsername}_${repo.name}`,
        description: repo.description || `Analysis for ${repo.name}`,
        githubUrl: repo.html_url,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || 'main',
        user,
        estimatedLinesOfCode: locData.totalLines,
        languageDistribution: locData.languages,
        username: user.username,
        analysisStartTime: new Date(),
        result: "In Progress"
      });

      await this.projectRepo.save(project);
    }

    
    await this.cleanBranch(project.u_id, branchName);

    let repoPath: string | null = null;
    try {
      
      repoPath = await this.cloneRepository(project.githubUrl, branchName);

      
      this.createSonarPropertiesFile(
        repoPath,
        projectKey,
        projectName,
        branchName
      );

      await this.runSonarScanner(repoPath, branchName);
      
      await this.waitForProjectAnalysis(projectKey, authHeader, branchName);

      await this.storeAnalysisResults(project, branchName, authHeader);

      const repo = await this.repoDetail.findOne({ where: { name: project.title } });
      if (!repo) throw new Error("Repo not found");

      const branchEntity = this.branchRepo.create({
        name: branchName,
        repoName: project.title,
        username: user.username,
        repo: repo,
        user: user
      });

      await this.branchRepo.save(branchEntity);

      return {
        success: true,
        message: `Successfully analyzed branch ${branchName} of repository ${repoName}`
      };
    } catch (error) {
      console.error(`Analysis failed for branch ${branchName}:`, error);
      return {
        success: false,
        message: `Analysis failed for branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`
      };
    } finally {
      if (repoPath) {
        await this.cleanupRepository(repoPath);
      }
    }
  } catch (error) {
    console.error("Error in triggerBranchAnalysis:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}
  private async configureSonarQubeProject(
    user: User,
    project: Project,
    repo: any,
    authHeader: string
  ) {
    const projectKey = project.repoName;
    
    try {
      const projectResponse = await fetch(
        `${SONARQUBE_API_URL}/api/projects/search?projects=${projectKey}`,
        { headers: { Authorization: authHeader } }
      );
  
      if (!projectResponse.ok) throw new Error(await projectResponse.text());
  
      const projectData = await projectResponse.json();
      if (projectData.components.length === 0) {
        const createResponse = await fetch(`${SONARQUBE_API_URL}/api/projects/create`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: repo.name,
            project: projectKey,
            visibility: "public",
          }).toString(),
        });
  
        if (!createResponse.ok) throw new Error(await createResponse.text());
      }

      const propertiesToSet = [
        { key: 'sonar.projectKey', value: projectKey },
        { key: 'sonar.projectName', value: repo.name },
        { key: 'sonar.scm.provider', value: 'git' },
        { key: 'sonar.scm.url', value: repo.html_url },
        { key: 'sonar.links.scm', value: repo.html_url },
        { key: 'sonar.links.homepage', value: repo.html_url },
        { key: 'sonar.github.repository', value: repo.full_name },
        { key: 'sonar.github.oauth', value: user.githubAccessToken || '' }
      ];
    
      for (const prop of propertiesToSet) {
        const response = await fetch(`${SONARQUBE_API_URL}/api/settings/set`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            key: prop.key,
            value: prop.value,
            component: projectKey
          }).toString(),
        });
    
        if (!response.ok) {
          console.error(`Failed to set property ${prop.key}:`, await response.text());
        }
      }
  
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  private async configureSonarQubeWebhook(project: Project, authHeader: string) {
    try {
      const webhookName = `Analysis_${project.repoName}`;
      const webhookUrl = `${process.env.WEBHOOK_URL}?projectId=${project.u_id}`;
  
      const listResponse = await fetch(
        `${SONARQUBE_API_URL}/api/webhooks/list`,
        { headers: { Authorization: authHeader } }
      );
  
      if (listResponse.ok) {
        const webhooks = await listResponse.json();
        const existingWebhook = webhooks.webhooks.find((wh: any) => wh.name === webhookName);
  
        if (existingWebhook) {
          const updateResponse = await fetch(
            `${SONARQUBE_API_URL}/api/webhooks/update`,
            {
              method: "POST",
              headers: {
                Authorization: authHeader,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                webhook: existingWebhook.key,
                name: webhookName,
                url: webhookUrl,
                secret: process.env.WEBHOOK_SECRET || ''
              }).toString(),
            }
          );
          if (!updateResponse.ok) throw new Error(await updateResponse.text());
          return;
        }
      }
  
      const createResponse = await fetch(
        `${SONARQUBE_API_URL}/api/webhooks/create`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            name: webhookName,
            url: webhookUrl,
            secret: process.env.WEBHOOK_SECRET || ''
          }).toString(),
        }
      );
  
      if (!createResponse.ok) throw new Error(await createResponse.text());
    } catch (error) {
      throw new Error(`Error configuring webhook: ${error}`);
    }
  }
  

  private async triggerSonarQubeAnalysis(user: User, project: Project, repo: any, authHeader: string): Promise<boolean> {
    try {
        
        await this.configureSonarQubeWebhook(project, authHeader);
         console.log("Analysed")
        const user = await this.userRepo.findOne({
          where: { username: project.username },
          select: ["u_id", "githubAccessToken","username"]
      });

        if (!user?.githubAccessToken) {
            throw new Error(`GitHub access token not found for user ${project.username}`);
        }

        await this.ensureSonarQubeProject(project, authHeader);
        await this.updateProjectSettings(project, authHeader, user.githubAccessToken);

        const branchesResponse = await fetch(
            `${GITHUB_API_URL}/repos/${project.username}/${project.title}/branches`,
            {
                headers: {
                    Authorization: `Bearer ${user.githubAccessToken}`,
                    Accept: "application/vnd.github.v3+json"
                }
            }
        );

        if (!branchesResponse.ok) {
            throw new Error(`Failed to fetch branches: ${await branchesResponse.text()}`);
        }

        const branches = await branchesResponse.json();

        if (!Array.isArray(branches) || branches.length === 0) {
            console.warn(`No branches found for repo: ${project.title}`);
            return false;
        }

        for (const branch of branches) {
            let repoPath: string | null = null;
            const branchName = branch.name;
            const sonarProjectKey = `${user.username}_${project.title}_${branchName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
            const projectName = `${project.title}-${branchName}`;

            try {
                console.log(`Starting analysis for branch: ${branchName}`);

                await this.cleanBranch(project.u_id, branchName);

                repoPath = await this.cloneRepository(project.githubUrl, branchName);

                this.createSonarPropertiesFile(
                    repoPath,
                    sonarProjectKey,
                    projectName,
                    branchName
                );

                await this.runSonarScanner(repoPath, branchName);

                await this.waitForProjectAnalysis(sonarProjectKey, authHeader, branchName);
                const repo = await this.repoDetail.findOne({ where: { name: project.title } });
                if (!repo) throw new Error("Repo not found");
                const user = await this.userRepo.findOne({ where: { username: project.username } });
                if (!user) throw new Error("User not found");

                const branchEntity = this.branchRepo.create({
                  name: branchName,
                  repoName: project.title,
                  username: user.username,
                  repo: repo,
                  user: user
                });
      
              await this.branchRepo.save(branchEntity);
              await this.storeAnalysisResults(project, branchName, authHeader);
        
                console.log(`Analysis successful for ${branchName}`);
            } catch (error) {
                console.error(`Failed for branch ${branchName}:`, error);

                await this.cleanBranch(project.u_id, branchName);

                project.result = `Analysis failed for ${branchName}`;
                await this.projectRepo.save(project);
            } finally {
                if (repoPath) await this.cleanupRepository(repoPath);
            }
        }

        return true;
    } catch (err) {
        if (err instanceof Error) {
            throw new Error(`Trigger analysis error: ${err.message}`);
        } else {
            throw new Error(`Trigger analysis error: ${JSON.stringify(err)}`);
        }
    }
  }

private async cleanBranch(projectId: string, branchName: string): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
      await this.cleanBranchData(queryRunner, projectId, branchName);
      await queryRunner.commitTransaction();
  } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Failed to clean data for branch ${branchName}:`, error);
  } finally {
      await queryRunner.release();
  }
}


private async waitForProjectAnalysis(projectKey: string, authHeader: string, branch: string) {
  const maxAttempts = 30;
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
          const ceTaskUrl = `${SONARQUBE_API_URL}/api/ce/component?component=${encodeURIComponent(projectKey)}&branch=${branch}`;
          const statusResponse = await fetch(ceTaskUrl, {
              headers: { Authorization: authHeader }
          });

          const statusData = await statusResponse.json();

          if (statusResponse.ok && statusData.current) {
              const status = statusData.current.status;
              if (status === "SUCCESS") {
                  console.log(`SonarQube analysis completed for branch: ${branch}`);
                  return;
              }
              if (status === "FAILED") {
                  throw new Error(`Analysis failed for branch: ${branch}`);
              }
          }

          console.log(`Waiting for analysis to complete (Attempt ${attempt}/${maxAttempts})...`);
          await delay(10000); // Wait 10 seconds
      } catch (error) {
          console.warn(`Error while checking analysis status: ${error}`);
          await delay(10000);
      }
  }

  throw new Error(`Timeout: Analysis not completed for branch: ${branch}`);
}

  private async cloneRepository(githubUrl: string, branch: string): Promise<string> {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-'));
    const normalizedTempDir = path.normalize(tempDir);
    const repoPath = path.join(normalizedTempDir, `repo-${branch.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    const { execFileSync } = require("child_process");

    execFileSync("git", ["clone", "-b", branch, "--single-branch", githubUrl, repoPath], { stdio: "inherit" });

    return repoPath;
  }
  private async cleanupRepository(repoPath: string): Promise<void> {
    const { promisify } = require('util');
    const rimraf = promisify(require('rimraf'));

    try {
        await rimraf(repoPath);
    } catch (error) {
        console.error(`Error cleaning up repository at ${repoPath}:`, error);
    }
  }
  private async runSonarScanner(repoPath: string, branchName: string): Promise<void> {
    try {
      const normalizedRepoPath = path.normalize(repoPath);
      const propertiesPath = path.join(normalizedRepoPath, 'sonar-project.properties').replace(/\\/g, '/');
  
      console.log(`Running SonarScanner for branch: ${branchName}`);
      console.log(`Using properties file at: ${propertiesPath}`);
  
      const { stdout, stderr } = await execAsync(
        `sonar-scanner -X -Dproject.settings=${propertiesPath}`,
        {
          cwd: normalizedRepoPath,
          maxBuffer: 1024 * 1024 * 20,
          timeout: 900_000,
        }
      );
  
      console.log(`SonarScanner Output:\n${stdout}`);
  
      if (stderr) {
        console.warn(`SonarScanner Warnings:\n${stderr}`);
      }
  
      if (!stdout.includes("EXECUTION SUCCESS")) {
        throw new Error(`SonarScanner did not succeed. Check logs.`);
      }
  
      if (stdout.includes("EXECUTION FAILURE") || stderr.includes("ERROR")) {
        throw new Error(`SonarScanner execution failed:\n${stdout}\n${stderr}`);
      }
    } catch (error: any) {
      console.error(`SonarScanner failed for ${branchName}:`, error.message || error);
      throw new Error(`SonarScanner failed: ${error.message || "Unknown error"}`);
    }
  }
  
private createSonarPropertiesFile(
  repoPath: string,
  projectKey: string,
  projectName: string,
  branchName: string
): string {
  const fs = require('fs-extra');
  const path = require('path');

  const normalizedRepoPath = path.normalize(repoPath);
  const propertiesFile = path.join(normalizedRepoPath, 'sonar-project.properties');

  const workingDir = path.join(normalizedRepoPath, '.scannerwork').replace(/\\/g, '/');
  const projectBaseDir = path.resolve(normalizedRepoPath).replace(/\\/g, '/');

  
  if (fs.existsSync(workingDir)) {
    fs.removeSync(workingDir);
  }

  const dummyPath = path.join(normalizedRepoPath, 'force-sonar.txt');
  fs.writeFileSync(dummyPath, `Forced update at ${new Date().toISOString()}`);

  const scannerProperties = [
    `sonar.projectKey=${projectKey}`,
    `sonar.projectName=${projectName}`,
    `sonar.host.url=${SONARQUBE_API_URL}`,
    `sonar.login=${SONARQUBE_API_TOKEN}`, // 🔥 Correct param
    `sonar.sources=.`,
    `sonar.sourceEncoding=UTF-8`,
    `sonar.verbose=true`,
    `sonar.scm.provider=git`,
    `sonar.working.directory=${workingDir}`,
    `sonar.projectBaseDir=${projectBaseDir}`,
    `sonar.analysis.mode=publish`,
    `sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**`
  ].join('\n');

  fs.writeFileSync(propertiesFile, scannerProperties);
  return propertiesFile;
}

  private async ensureSonarQubeProject(project: Project, authHeader: string) {
    const projectResponse = await fetch(
      `${SONARQUBE_API_URL}/api/projects/search?projects=${project.repoName}`,
      { headers: { Authorization: authHeader } }
    );

    if (!projectResponse.ok) throw new Error(await projectResponse.text());

    const projectData = await projectResponse.json();
    
    if (projectData.components.length === 0) {
      const createResponse = await fetch(`${SONARQUBE_API_URL}/api/projects/create`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: project.title,
          project: project.repoName,
          visibility: "public",
        }).toString(),
      });

      if (!createResponse.ok) throw new Error(await createResponse.text());
    }
  }

  private async updateProjectSettings(project: Project, authHeader: string, githubToken: string) {
    const settings = [
        { key: 'sonar.projectKey', value: project.repoName },
        { key: 'sonar.projectName', value: project.title },
        { key: 'sonar.scm.provider', value: 'git' },
        { key: 'sonar.scm.url', value: project.githubUrl },
        { key: 'sonar.links.scm', value: project.githubUrl },
        { key: 'sonar.links.homepage', value: project.githubUrl },
        { key: 'sonar.host.url', value: SONARQUBE_API_URL || '' },
        { key: 'sonar.login', value: SONARQUBE_API_TOKEN || '' },
        { key: 'sonar.sourceEncoding', value: 'UTF-8' },
        { key: 'sonar.github.repository', value: project.githubUrl.replace('https://github.com/', '') },
        { key: 'sonar.github.oauth', value: githubToken },
        { key: 'sonar.scm.disabled', value: 'false' },
        { key: 'sonar.scm.exclusions.disabled', value: 'true' },
        { key: 'sonar.analysis.mode', value: 'issues' },
        { key: 'sonar.analysis.skipPublish', value: 'false' },
        { key: 'sonar.scm.forceReloadAll', value: 'true' },
        { key: 'sonar.scm.revision', value: 'HEAD' },
        { key: 'sonar.branch.automaticDetection', value: 'true' },
        { key: 'sonar.branch.enable', value: 'true' }
    ];

    for (const setting of settings) {
        try {
            const response = await fetch(`${SONARQUBE_API_URL}/api/settings/set`, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    key: setting.key,
                    value: setting.value,
                    component: project.repoName
                }).toString()
            });

            if (!response.ok) {
                console.warn(`Failed to set setting ${setting.key}:`, await response.text());
            }
        } catch (error) {
            console.error(`Error setting ${setting.key}:`, error);
        }
    }
   }


   private async getRepositoryLinesOfCode(
    user: User,
    repo: any
  ): Promise<{ totalLines: number; languages: Record<string, number> }> {
    try {
      const response = await fetch(
        `${GITHUB_API_URL}/repos/${user.username}/${repo.name}/languages`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );
  
      if (!response.ok) throw new Error(await response.text());
  
      const languagesData = await response.json();
      let totalLines = 0;
      const languages: Record<string, number> = {};
  
      
      const languageEntities = await dataSource.getRepository(LanguageBytesPerLineEntity).find();
      const languageMap: Record<string, number> = {};
  
      for (const entity of languageEntities) {
        languageMap[entity.language] = entity.avgBytesPerLine;
      }
  
      const defaultBytesPerLine = languageMap["Default"] || 50;
  
      for (const [language, bytes] of Object.entries(languagesData)) {
        const avgBytesPerLine = languageMap[language] || defaultBytesPerLine;
        const lines = Math.floor(Number(bytes) / avgBytesPerLine);
        languages[language] = Math.round(lines);
        totalLines += lines;
      }
  
      return { totalLines: Math.round(totalLines), languages };
    } catch (error) {
      console.error("Error calculating lines of code:", error);
      return { totalLines: 0, languages: {} };
    }
  }

  @Mutation(() => Boolean)
  public async handleWebhookEvent(
    @Arg("projectId") projectId: string,
    @Arg("status") status: string,
    @Arg("authHeader") authHeader: string
  ) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  
    try {
      const project = await queryRunner.manager.findOne(Project, { 
        where: { u_id: projectId },
        relations: ["codeMetrics", "sonarIssues"]
      });
  
      if (!project) {
        throw new Error('Project not found');
      }
  
      project.analysisEndTime = new Date();
      project.analysisDuration = Math.floor(
        (project.analysisEndTime.getTime() - project.analysisStartTime.getTime()) / 1000
      );
  
      if (status === 'SUCCESS') {
        project.result = 'Analysis completed';
        await queryRunner.manager.save(project);
        const branchName = project.defaultBranch || 'main';
        await this.storeAnalysisResults(project, branchName, authHeader);
      } else if (status === 'FAILED') {
        project.result = 'Analysis failed';
        await queryRunner.manager.save(project);
      }
  
      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async storeAnalysisResults(project: Project, branchName: string, authHeader: string): Promise<void> {
    try {
        const projectKey =`${project.username}_${project.title}_${branchName}`.replace(/[^a-zA-Z0-9_-]/g, "_");;
        const sourceBranch = "main";
        const targetBranch = branchName;

        const measures = await this.getBranchMeasures(projectKey, sourceBranch, authHeader);
        
        const issues = await this.getBranchIssues(projectKey, sourceBranch, authHeader);
        
        const metrics = await this.getCodeMetrics(projectKey, sourceBranch, authHeader);
        
        const dashboardUrl = `${SONARQUBE_API_URL}/dashboard?id=${encodeURIComponent(projectKey)}&branch=${encodeURIComponent(sourceBranch)}`;
        
        await this.storeBranchAnalysis(
            project,
            targetBranch,
            dashboardUrl,
            measures,
            issues,
            metrics
        );
        const repoRecord = await this.repoDetail.findOne({
          where: { name: project.title }
        });
        
        if (!repoRecord) {
          throw new Error(`Repository with name '${project.title}' not found`);
        }
        
        const repoId = repoRecord.id; 
        const branchRepo = dataSource.getRepository(Branch);
        let existingBranch = await branchRepo.findOne({
            where: {
                name: branchName,
                repoName: project.title,
                username: project.username
            }
        });

        if (!existingBranch) {
            existingBranch = branchRepo.create({
                name: branchName,
                repoName: project.title,
                username: project.username,
                repoId: repoId,
                dashboardUrl: dashboardUrl
            });
        } else {
            existingBranch.dashboardUrl = dashboardUrl;
        }

        await branchRepo.save(existingBranch);

        console.log(`Stored analysis results for branch ${branchName}`);
    } catch (error) {
        console.error(`Failed to store analysis results for branch ${branchName}:`, error);
        throw error;
    }
}

private async getBranchMeasures(projectKey: string, branchName: string, authHeader: string): Promise<any> {
  const metrics = [
      'bugs', 'vulnerabilities', 'code_smells', 'coverage', 'duplicated_lines_density',
      'ncloc', 'sqale_index', 'alert_status', 'reliability_rating', 'security_rating',
      'sqale_rating'
  ].join(',');

  const url = `${SONARQUBE_API_URL}/api/measures/component?component=${encodeURIComponent(projectKey)}` +
      `&branch=${encodeURIComponent(branchName)}` +
      `&metricKeys=${metrics}`;

  const response = await fetch(url, {
      headers: { Authorization: authHeader }
  });

  if (!response.ok) {
      throw new Error(`Failed to get measures: ${await response.text()}`);
  }

  const textResponse = await response.text();

  try {
      return JSON.parse(textResponse);
  } catch (error) {
    
      if (textResponse.includes(';')) {
          const metricsObject: { [key: string]: number } = {};
          const metricsArray = textResponse.split(';');
          metricsArray.forEach(item => {
              const [key, value] = item.split('=');
              metricsObject[key] = parseInt(value);
          });
          return metricsObject;
      }

      throw new Error(`Unexpected response format: ${textResponse}`);
  }
}

private async getCodeMetrics(projectKey: string, branchName: string, authHeader: string): Promise<any> {
  const metrics = [
      'complexity', 'cognitive_complexity', 'classes', 'functions', 'files',
      'lines', 'comment_lines', 'comment_lines_density', 'ncloc_language_distribution'
  ].join(',');

  const url = `${SONARQUBE_API_URL}/api/measures/component?component=${encodeURIComponent(projectKey)}` +
      `&branch=${encodeURIComponent(branchName)}` +
      `&metricKeys=${metrics}`;

  const response = await fetch(url, {
      headers: { Authorization: authHeader }
  });

  if (!response.ok) {
      throw new Error(`Failed to get code metrics: ${await response.text()}`);
  }

  const textResponse = await response.text();

  try {
      
      return JSON.parse(textResponse);
  } catch (error) {
      
      if (textResponse.includes(';')) {
          const metricsObject: { [key: string]: number } = {};
          const metricsArray = textResponse.split(';');
          metricsArray.forEach(item => {
              const [key, value] = item.split('=');
              metricsObject[key] = parseInt(value);
          });
          return metricsObject;
      }

      throw new Error(`Unexpected response format: ${textResponse}`);
  }
}


private async getBranchIssues(projectKey: string, branchName: string, authHeader: string): Promise<any[]> {
  let allIssues: any[] = [];
  let page = 1;
  const pageSize = 500;
  let morePages = true;

  while (morePages) {
      const url = new URL(`${SONARQUBE_API_URL}/api/issues/search`);
      url.searchParams.append('componentKeys', projectKey);
      url.searchParams.append('branch', branchName);
      url.searchParams.append('issueStatuses', 'OPEN,CONFIRMED'); 
      url.searchParams.append('ps', pageSize.toString());
      url.searchParams.append('p', page.toString());

      const response = await fetch(url.toString(), {
          headers: { Authorization: authHeader }
      });

      if (!response.ok) {
          throw new Error(`Failed to get issues: ${await response.text()}`);
      }

      const data = await response.json();
      allIssues = allIssues.concat(data.issues);

      morePages = data.paging.total > page * pageSize;
      page++;
  }

  return allIssues;
}

private async storeBranchAnalysis(
    project: Project,
    branchName: string,
    dashboardUrl: string,
    measures: any,
    issues: any[],
    metricsData: any
): Promise<void> {
    const issueRepo = dataSource.getRepository(SonarIssue);
    const metricsRepo = dataSource.getRepository(CodeMetrics);
    await dataSource.transaction(async transactionalEntityManager => {
      let codeMetrics = metricsRepo.create({
        project,
        branch: branchName,
        createdAt: new Date(),
        repoName: project.title,
        username: project.username
    });    

        if (metricsData.component?.measures) {
            for (const measure of metricsData.component.measures) {
                switch (measure.metric) {
                    case 'complexity':
                        codeMetrics.complexity = parseInt(measure.value);
                        break;
                    case 'cognitive_complexity':
                        codeMetrics.complexity = parseInt(measure.value);
                        break;
                    case 'classes':
                        codeMetrics.filesCount = parseInt(measure.value);
                        break;
                    case 'functions':
                        break;
                    case 'files':
                        codeMetrics.filesCount = parseInt(measure.value);
                        break;
                    case 'lines':
                        codeMetrics.linesOfCode = parseInt(measure.value);
                        break;
                    case 'comment_lines':
                        break;
                    case 'comment_lines_density':
                        break;
                        case 'ncloc_language_distribution':
                          const langValue = measure.value;
                          if (langValue.includes(';')) {
                            const langDist: Record<string, number> = langValue.split(';').reduce(
                              (acc: Record<string, number>, pair: string) => {
                                const [lang, count] = pair.split('=');
                                if (lang && count) acc[lang] = parseInt(count);
                                return acc;
                              },
                              {} as Record<string, number>
                            );
                            
                            const topLang = Object.entries(langDist).sort((a, b) => b[1] - a[1])[0]?.[0];
                            codeMetrics.language = topLang || 'unknown';                            
                          } else {
                              codeMetrics.language = 'unknown';
                          }
                          break;
                      
                }
            }
        }

        if (measures.component?.measures) {
            for (const measure of measures.component.measures) {
                switch (measure.metric) {
                    case 'bugs':
                        codeMetrics.bugs = parseInt(measure.value);
                        break;
                    case 'vulnerabilities':
                        codeMetrics.vulnerabilities = parseInt(measure.value);
                        break;
                    case 'code_smells':
                        codeMetrics.codeSmells = parseInt(measure.value);
                        break;
                    case 'coverage':
                        codeMetrics.coverage = parseFloat(measure.value);
                        break;
                    case 'duplicated_lines_density':
                        codeMetrics.duplicatedLines = parseFloat(measure.value);
                        break;
                    case 'ncloc':
                        codeMetrics.linesOfCode = parseInt(measure.value);
                        break;
                    case 'sqale_index':
                        codeMetrics.technicalDebt = parseInt(measure.value);
                        break;
                    case 'alert_status':
                        codeMetrics.qualityGateStatus = measure.value;
                        break;
                    case 'reliability_rating':
                        codeMetrics.reliabilityRating = parseFloat(measure.value);
                        break;
                    case 'security_rating':
                        codeMetrics.securityRating = parseFloat(measure.value);
                        break;
                }
            }
        }  


        await transactionalEntityManager.save(codeMetrics);

        await issueRepo.delete({ 
            project: { u_id: project.u_id },
            branch: branchName
        });

        const issueEntities = issues.map(issue => {
            return issueRepo.create({
                project,
                branch: branchName,
                repoName: project.title,
                username: project.username,
                key: issue.key,
                rule: issue.rule,
                severity: issue.severity,
                component: issue.component,
                line: issue.line,
                message: issue.message,
                type: issue.type,
                createdAt: new Date(issue.creationDate)
            });
        });
        await transactionalEntityManager.save(issueEntities);
    });
  }

   
  private async cleanBranchData(queryRunner: QueryRunner, projectId: string, branchName: string) {
    await queryRunner.manager.delete(SonarIssue, {
        project: { u_id: projectId },
        branch: branchName
    });

    await queryRunner.manager.delete(CodeMetrics, {
        project: { u_id: projectId },
        branch: branchName
    });
}


  

  private async getLinesOfCodeReport(
    githubUsername: string,
    repoName: string,
    branch: string
): Promise<LocReport> {
    try {
        
        const projectKey = `${githubUsername}_${repoName}_${branch}`;
        const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;
        
        const url = new URL(`${SONARQUBE_API_URL}/api/measures/component`);
        url.searchParams.append('component', projectKey);
        url.searchParams.append('metricKeys', 'ncloc,ncloc_language_distribution');

        const response = await fetch(url.toString(), {
            headers: { Authorization: authHeader }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch lines of code: ${errorText}`);
        }

        const data = await response.json();
        const measures = data.component?.measures || [];
        
        let totalLines = 0;
        let sonarQubeLines = 0;
        let languageDistribution: Record<string, number> = {};

        measures.forEach((measure: any) => {
            if (measure.metric === 'ncloc') {
                sonarQubeLines = parseInt(measure.value);
                totalLines = sonarQubeLines;
            }
            if (measure.metric === 'ncloc_language_distribution') {
                languageDistribution = this.parseLanguageDistribution(measure.value);
                totalLines = Object.values(languageDistribution).reduce((sum, val) => sum + val, 0) || totalLines;
            }
        });

        return {
            totalLines,
            sonarQubeLines,
            languageDistribution,
            lastUpdated: new Date(),
        };
    } catch (error) {
        console.error('Error in getLinesOfCodeReport:', error);
        return {
            totalLines: 0,
            sonarQubeLines: 0,
            languageDistribution: {},
            lastUpdated: new Date(),
        };
    }
}

  private parseLanguageDistribution(distribution: string): Record<string, number> {
    const result: Record<string, number> = {};
    if (!distribution) return result;
    
    const items = distribution.split(';');
    
    items.forEach(item => {
      const [lang, lines] = item.split('=');
      if (lang && lines && !isNaN(Number(lines))) {
        const normalizedLang = lang.trim();
        result[normalizedLang] = parseInt(lines, 10);
      }
    });
    console.log("LAnguages",Object.entries);
    return Object.fromEntries(
      Object.entries(result).sort((a, b) => b[1] - a[1])
    );
  }

} 
