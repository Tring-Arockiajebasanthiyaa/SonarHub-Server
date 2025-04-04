import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { SonarIssue } from "../entity/sonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";
import { LocReport } from "../graphql/types/LocReport";
import { Branch } from "../../branch/entity/branch.entity";
import { Repo } from "../../GitHubRepository/entity/repo.entity";
import { QueryRunner } from "typeorm";
import { ProjectAnalysisResult } from "../graphql/types/projectAnalysisResult.type";
import axios from "axios";
import { exec} from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
dotenv.config();

const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_API_TOKEN = process.env.SONARQUBE_API_TOKEN;
const GITHUB_API_URL = process.env.GITHUB_API;
enum LanguageBytesPerLine {
  JavaScript = 20,
  TypeScript = 20,
  Java = 15,
  Python = 10,
  Ruby = 10,
  PHP = 15,
  "C++" = 15,
  C = 15,
  Go = 15,
  Swift = 15,
  Kotlin = 15,
  HTML = 30,
  CSS = 25,
  SCSS = 25,
  JSON = 40,
  Default = 20,
}
@Resolver()
export class SonarQubeResolver {
  private readonly projectRepo = dataSource.getRepository(Project);
  private readonly userRepo = dataSource.getRepository(User);
  private readonly metricsRepo = dataSource.getRepository(CodeMetrics);
  private readonly issuesRepo = dataSource.getRepository(SonarIssue);
  // private readonly branchRepo = dataSource.getRepository(Branch);
  
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
        select: ["u_id", "githubAccessToken"]
      });

      if (!user || !user.githubAccessToken) {
        throw new Error(`GitHub access token not found for user ${githubUsername}`);
      }
      const repoDetails = await axios.get(
        `https://api.github.com/repos/${githubUsername}/${repoName.trim()}`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      const defaultBranch = repoDetails.data.default_branch || "main";
      let branches = [];

      try {
        const branchResponse = await axios.get(
          `https://api.github.com/repos/${githubUsername}/${repoName.trim()}/branches`,
          {
            headers: {
              Authorization: `Bearer ${user.githubAccessToken}`,
              Accept: "application/vnd.github.v3+json",
            },
          }
        );
        branches = branchResponse.data.map((b: any) => ({
          name: b.name,
          dashboardUrl: b._links.html,
        }));
      } catch {
        branches = [{ name: defaultBranch, dashboardUrl: "" }];
      }

      // Validate branch exists
      if (branch && !branches.some((b: any) => b.name === branch)) {
        branch = defaultBranch;
      }

      // Get branch-specific data
      const [codeMetrics, sonarIssues, locReport] = await Promise.all([
        this.metricsRepo.find({
          where: branch
            ? { project: { repoName: projectKey }, branch }
            : { project: { repoName: projectKey } },
        }),
        this.issuesRepo.find({
          where: branch
            ? { project: { repoName: projectKey }, branch }
            : { project: { repoName: projectKey } },
        }),
        this.getLinesOfCodeReport(githubUsername, repoName.trim(), branch || defaultBranch),
      ]);
      console.log(project,codeMetrics,sonarIssues,branches,"REsponses");
      return {
        project,
        branches,
        codeMetrics,
        sonarIssues,
        locReport,
      };
    } catch (error) {
      console.error("Error in getProjectAnalysis:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to analyze project: ${error.message}`);
      }
      throw new Error("Failed to analyze project due to an unknown error.");
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
        `https://api.github.com/repos/${githubUsername}/${cleanedRepoName}/branches`,
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
  async analyzeSingleRepository(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<AnalysisResult> {
    try {
      const user = await this.userRepo.findOne({ 
        where: { username: githubUsername },
        select: ["u_id", "username", "githubAccessToken"]
      });
      
      if (!user) {
        throw new Error(`User ${githubUsername} not found`);
      }
      if (!user.githubAccessToken) {
        throw new Error(`GitHub access token not found for user ${githubUsername}`);
      }

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
        const errorData = await repoResponse.json();
        throw new Error(`GitHub API error: ${repoResponse.status} - ${errorData.message}`);
      }

      const repo = await repoResponse.json();

      if (!repo.html_url || repo.html_url.includes('github.com/default')) {
        throw new Error(`Invalid repository URL received: ${repo.html_url}`);
      }

      await this.analyzeRepository(user, repo);

      return {
        success: true,
        message: `Successfully analyzed repository ${repoName}`
      };
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
    
    const locData = await this.getRepositoryLinesOfCode(user, repo);
    
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

    await this.projectRepo.save(project);
  
    try {
      await this.configureSonarQubeProject(user, project, repo, authHeader);
      await this.triggerSonarQubeAnalysis(project, authHeader);
      const analysisEndTime = new Date();
      project.result = "Analysis completed";
      project.analysisEndTime = analysisEndTime;
      project.analysisDuration = Math.floor(
        (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
      );
      project.lastAnalysisDate = new Date();
      await this.projectRepo.save(project);
    } catch (error) {
      const analysisEndTime = new Date();
      project.result = "Analysis failed";
      project.analysisEndTime = analysisEndTime;
      project.analysisDuration = Math.floor(
        (analysisEndTime.getTime() - analysisStartTime.getTime()) / 1000
      );
      await this.projectRepo.save(project);
      throw error;
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
            project: project.repoName,
            secret: process.env.WEBHOOK_SECRET || ''
          }).toString(),
        }
      );

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        if (errorData.errors?.[0]?.msg?.includes('Maximum number of webhook reached')) {
          return;
        }
        throw new Error(`Failed to create webhook: ${await createResponse.text()}`);
      }
    } catch (error) {
      throw error;
    }
  }

  private async triggerSonarQubeAnalysis(project: Project, authHeader: string): Promise<boolean> {
    try {
        await this.configureSonarQubeWebhook(project, authHeader);

        const user = await this.userRepo.findOne({
            where: { username: project.username },
            select: ["u_id", "githubAccessToken"]
        });

        if (!user || !user.githubAccessToken) {
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
        
        if (branches.length === 0) {
            return false;
        }

        for (const branch of branches) {
            let repoPath: string | null = null;
            try {
                console.log(`Processing branch: ${branch.name}`);
                
                repoPath = await this.cloneRepository(project.githubUrl, branch.name);
                
                this.createSonarPropertiesFile(repoPath, project.repoName, project.title, branch.name);

                await this.runSonarScanner(repoPath, branch.name);
                
                //await this.waitForProjectAnalysis(project, authHeader, branch.name);
                
                await this.storeAnalysisResults(project, branch.name, authHeader);
                
                console.log(`Successfully analyzed and stored results for branch: ${branch.name}`);
            } catch (branchError) {
                console.error(`Error processing branch ${branch.name}:`, branchError);
                project.result = "Analysis failed";
                await this.projectRepo.save(project);
            } finally {
                if (repoPath) {
                    await this.cleanupRepository(repoPath);
                }
            }
        }
        return true;
    } catch (error) {
        throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

private async waitForProjectAnalysis(project: Project, authHeader: string, branch: string) {
    const maxAttempts = 30; 
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const projectKey = project.repoName;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const statusUrl = `${SONARQUBE_API_URL}/api/ce/component?component=${encodeURIComponent(projectKey)}&branch=${branch}`;
            const statusResponse = await fetch(statusUrl, {
                headers: { Authorization: authHeader }
            });

            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.current && statusData.current.status === 'SUCCESS') {
                    console.log(`Analysis completed for branch ${branch}`);
                    return;
                }
                if (statusData.current && statusData.current.status === 'FAILED') {
                    throw new Error(`Analysis failed for branch ${branch}`);
                }
            }

            // Check if component exists
            const componentUrl = `${SONARQUBE_API_URL}/api/components/show?component=${encodeURIComponent(projectKey)}&branch=${branch}`;
            const componentResponse = await fetch(componentUrl, {
                headers: { Authorization: authHeader }
            });

            if (componentResponse.ok) {
                console.log(`Component found for branch ${branch}`);
                return;
            }

            console.log(`Waiting for analysis to complete (Attempt ${attempt}/${maxAttempts})...`);
            await delay(10000); // Wait 10 seconds before retrying
        } catch (error) {
            console.error(`Error while waiting for analysis: ${error}`);
            await delay(10000);
        }
    }

    throw new Error(`Analysis timeout for branch ${branch}`);
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
    const fs = require('fs');
    const path = require('path');
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

        const { stdout, stderr } = await execAsync(
            `sonar-scanner -Dproject.settings=${propertiesPath}`,
            {
                cwd: normalizedRepoPath,
                maxBuffer: 1024 * 1024 * 20,
                timeout: 900000
            }
        );

        console.log(`SonarScanner output for ${branchName}:\n${stdout}`);

        if (stderr) {
            console.warn(`SonarScanner warnings for ${branchName}:\n${stderr}`);
        }

        if (stdout.includes("EXECUTION FAILURE") || stderr.includes("ERROR")) {
            throw new Error(`SonarScanner execution failed:\n${stdout}\n${stderr}`);
        }
    } catch (error: any) {
        console.error(`SonarScanner failed for ${branchName}:`, error.message || error);
        throw new Error(`SonarScanner failed: ${error.message || "Unknown error"}`);
    }
}

  private createSonarPropertiesFile(repoPath: string, projectKey: string, projectName: string, branchName: string): string {
    const fs = require('fs');
    const path = require('path');
    
    const normalizedRepoPath = path.normalize(repoPath);
    const propertiesFile = path.join(normalizedRepoPath, 'sonar-project.properties');
    
    const workingDir = path.join(normalizedRepoPath, '.scannerwork').replace(/\\/g, '/');
    const projectBaseDir = path.resolve(normalizedRepoPath).replace(/\\/g, '/');

     const scannerProperties = [
    `sonar.projectKey=${projectKey}_${branchName}`, 
    `sonar.projectName=${projectName}_${branchName}`,
    `sonar.host.url=${SONARQUBE_API_URL}`,
    `sonar.token=${SONARQUBE_API_TOKEN}`,
    `sonar.scm.provider=git`,
    `sonar.sources=.` ,
    `sonar.sourceEncoding=UTF-8`,
    `sonar.scm.forceReloadAll=false`,
    `sonar.scm.revision=HEAD`,
    `sonar.scm.disabled=false`,
    `sonar.scm.exclusions.disabled=true`,
    `sonar.java.binaries=target/classes`,
    `sonar.working.directory=${workingDir}`,
    `sonar.projectBaseDir=${projectBaseDir}`,
    `sonar.verbose=true`
].join('\n');
   fs.writeFileSync(propertiesFile, scannerProperties);

    return propertiesFile;
   }

  private async storeBranchAnalysis(repoName: string, username: string, branchName: string, dashboardUrl: string) {
    const branchRepo = dataSource.getRepository(Branch);
    const repoRepo = dataSource.getRepository(Repo);
    const userRepo = dataSource.getRepository(User);

    let repo = await repoRepo.findOne({ 
        where: { name: repoName },
        relations: ["owner"]
    });

    if (!repo) {
        const user = await userRepo.findOne({ where: { username } });
        if (!user) {
            throw new Error(`User ${username} not found`);
        }

        repo = repoRepo.create({
            name: repoName,
            owner: user,
            language: '',
            stars: 0,
            totalCommits: 0
         });
        await repoRepo.save(repo);
    }

    let branch = await branchRepo.findOne({ 
        where: { repoName, username, name: branchName } 
    });

    if (!branch) {
        branch = branchRepo.create({ 
            repo,  
            repoName, 
            username, 
            name: branchName, 
            dashboardUrl,
            repoId: repo.id
        });
    } else {
        branch.dashboardUrl = dashboardUrl;
    }

    await branchRepo.save(branch);
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
  
      for (const [language, bytes] of Object.entries(languagesData)) {
        const avgBytesPerLine =
          LanguageBytesPerLine[language as keyof typeof LanguageBytesPerLine] ||
          LanguageBytesPerLine.Default;
        const lines = Math.floor(Number(bytes) / avgBytesPerLine);
        languages[language] = Math.round(lines);
        totalLines += lines;
      }
  
      return { totalLines: Math.round(totalLines), languages };
    } catch (error) {
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

  private async storeAnalysisResults(
    project: Project, 
    branchName: string, 
    authHeader: string
  ) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const projectKey = project.repoName;
      
      // Fetch metrics and issues from SonarQube
      const { measures, qualityGateStatus } = await this.fetchBranchMetricsWithLanguages(
        projectKey,
        branchName,
        authHeader
      );

      const branchIssues = await this.fetchBranchIssues(
        projectKey,
        branchName,
        project,
        authHeader
      );

      // Create and save metrics
      const codeMetrics = this.createBranchMetrics(
        project,
        branchName,
        measures,
        qualityGateStatus
      );

      // Save in transaction
      await queryRunner.manager.save(CodeMetrics, codeMetrics);
      if (branchIssues.length > 0) {
        await queryRunner.manager.save(SonarIssue, branchIssues);
      }

      // Store dashboard URL
      const dashboardUrl = `${SONARQUBE_API_URL}/dashboard?id=${encodeURIComponent(projectKey)}&branch=${branchName}`;
      await this.storeBranchAnalysisInTransaction(
        queryRunner,
        projectKey,
        project.username,
        branchName,
        dashboardUrl,
        project.u_id // Ensure this matches the expected type in the called method
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async storeBranchAnalysisInTransaction(
    queryRunner: QueryRunner,
    repoName: string,
    username: string,
    branchName: string,
    dashboardUrl: string,
    repoId: string 
  ) {
    const branchRepo = queryRunner.manager.getRepository(Branch);
    
    let branch = await branchRepo.findOne({ 
      where: { repoName, username, name: branchName } 
    });

    if (!branch) {
      branch = branchRepo.create({ 
        repoName, 
        username, 
        name: branchName, 
        dashboardUrl
      });
    } else {
      branch.dashboardUrl = dashboardUrl;
    }

    await branchRepo.save(branch);
  }


  private async fetchBranchMetricsWithLanguages(projectKey: string, branchName: string, authHeader: string) {
    const metricsUrl = new URL(`${SONARQUBE_API_URL}/api/measures/component`);
    metricsUrl.searchParams.append('component', projectKey);
    metricsUrl.searchParams.append('branch', branchName);
    metricsUrl.searchParams.append('metricKeys', [
        'ncloc', 'files', 'coverage', 'duplicated_lines_density',
        'violations', 'complexity', 'sqale_index', 'reliability_rating',
        'security_rating', 'bugs', 'vulnerabilities', 'code_smells',
        'ncloc_language_distribution'  
    ].join(','));

    const metricsResponse = await fetch(metricsUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (!metricsResponse.ok) {
        throw new Error(`Metrics API failed: ${await metricsResponse.text()}`);
    }

    const metricsData = await metricsResponse.json();
    const measures = metricsData.component?.measures || [];
    let qualityGateStatus = 'UNKNOWN';
    const qualityGateUrl = new URL(`${SONARQUBE_API_URL}/api/qualitygates/project_status`);
    qualityGateUrl.searchParams.append('projectKey', projectKey);
    qualityGateUrl.searchParams.append('branch', branchName);

    const qualityGateResponse = await fetch(qualityGateUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (qualityGateResponse.ok) {
        const qualityGateData = await qualityGateResponse.json();
        qualityGateStatus = qualityGateData.projectStatus.status;
    }

    return { measures, qualityGateStatus };
  }

  private extractLanguageDistribution(measures: any[]): Record<string, number> {
    const languageMeasure = measures.find(m => m.metric === "ncloc_language_distribution");
    
    if (!languageMeasure?.value) {
      return {};
    }

    const distribution: Record<string, number> = {};
    const items = languageMeasure.value.split(';');
    
    items.forEach((item:string)=> {
      const [lang, lines] = item.split('=');
      if (lang && lines && !isNaN(Number(lines))) {
        distribution[lang.trim()] = parseInt(lines, 10);
      }
    });

    return Object.fromEntries(
      Object.entries(distribution).sort((a, b) => b[1] - a[1])
    );
  }

  private async findSonarQubeProject(projectKey: string, authHeader: string) {
    const searchUrl = new URL(`${SONARQUBE_API_URL}/api/projects/search`);
    searchUrl.searchParams.append('q', projectKey);
    
    const searchResponse = await fetch(searchUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (!searchResponse.ok) {
        throw new Error(`Failed to search projects: ${await searchResponse.text()}`);
    }

    const searchData = await searchResponse.json();
    const sonarProject = searchData.components.find(
        (c: any) => c.key === projectKey || c.name === projectKey
    );

    if (!sonarProject) {
        throw new Error(`Project ${projectKey} not found in SonarQube`);
    }

    return sonarProject;
  }

  private async getProjectBranches(projectKey: string, authHeader: string): Promise<string[]> {
    const branchUrl = new URL(`${SONARQUBE_API_URL}/api/project_branches/list`);
    branchUrl.searchParams.append('project', projectKey);
    
    const branchResponse = await fetch(branchUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (!branchResponse.ok) {
        return ['main'];
    }

    const branchData = await branchResponse.json();
    return branchData.branches.map((b: any) => b.name);
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

  private async fetchBranchMetrics(projectKey: string, branchName: string, authHeader: string) {
    const metricsUrl = new URL(`${SONARQUBE_API_URL}/api/measures/component`);
    metricsUrl.searchParams.append('component', projectKey);
    metricsUrl.searchParams.append('branch', branchName);
    metricsUrl.searchParams.append('metricKeys', [
        'ncloc', 'files', 'coverage', 'duplicated_lines_density',
        'violations', 'complexity', 'sqale_index', 'reliability_rating',
        'security_rating', 'bugs', 'vulnerabilities', 'code_smells'
    ].join(','));

    const metricsResponse = await fetch(metricsUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (!metricsResponse.ok) {
        throw new Error(`Metrics API failed: ${await metricsResponse.text()}`);
    }

    const metricsData = await metricsResponse.json();
    const measures = metricsData.component?.measures || [];

    let qualityGateStatus = 'UNKNOWN';
    const qualityGateUrl = new URL(`${SONARQUBE_API_URL}/api/qualitygates/project_status`);
    qualityGateUrl.searchParams.append('projectKey', projectKey);
    qualityGateUrl.searchParams.append('branch', branchName);

    const qualityGateResponse = await fetch(qualityGateUrl.toString(), {
        headers: { Authorization: authHeader }
    });

    if (qualityGateResponse.ok) {
        const qualityGateData = await qualityGateResponse.json();
        qualityGateStatus = qualityGateData.projectStatus.status;
    }

    return { measures, qualityGateStatus };
  }

  private async fetchBranchIssues(projectKey: string, branchName: string, project: Project, authHeader: string) {
    const allIssues: SonarIssue[] = [];
    let page = 1;
    const pageSize = 500;
    let totalIssues = 0;
    let fetchedIssues = 0;

    do {
        const issuesUrl = new URL(`${SONARQUBE_API_URL}/api/issues/search`);
        issuesUrl.searchParams.append('projects', projectKey);
        issuesUrl.searchParams.append('branch', branchName);
        issuesUrl.searchParams.append('ps', pageSize.toString());
        issuesUrl.searchParams.append('p', page.toString());
        issuesUrl.searchParams.append('resolved', 'false');
        issuesUrl.searchParams.append('types', 'BUG,VULNERABILITY,CODE_SMELL');

        const issuesResponse = await fetch(issuesUrl.toString(), {
            headers: { Authorization: authHeader }
        });

        if (!issuesResponse.ok) {
            throw new Error(`Failed to fetch issues: ${await issuesResponse.text()}`);
        }

        const issuesData = await issuesResponse.json();
        const issues = issuesData.issues || [];
        totalIssues = issuesData.total || 0;

        allIssues.push(...issues.map((issue: any) => {
            const newIssue = new SonarIssue();
            newIssue.key = issue.key;
            newIssue.type = issue.type;
            newIssue.severity = issue.severity;
            newIssue.message = issue.message;
            newIssue.rule = issue.rule;
            newIssue.component = issue.component;
            newIssue.line = issue.line || 0;
            newIssue.status = issue.status;
            newIssue.resolution = issue.resolution;
            newIssue.project = project;
            newIssue.branch = branchName;
            return newIssue;
        }));

        fetchedIssues += issues.length;
        page++;
        if (fetchedIssues < totalIssues) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }

    } while (fetchedIssues < totalIssues);

    return allIssues;
  }

  private createBranchMetrics(project: Project, branchName: string, measures: any[], qualityGateStatus: string) {
    const codeMetrics = new CodeMetrics();
    codeMetrics.project = project;
    codeMetrics.branch = branchName;
    codeMetrics.qualityGateStatus = qualityGateStatus;
    codeMetrics.language = this.detectLanguage(measures);
    
    codeMetrics.linesOfCode = 0;
    codeMetrics.filesCount = 0;
    codeMetrics.coverage = 0;
    codeMetrics.duplicatedLines = 0;
    codeMetrics.violations = 0;
    codeMetrics.complexity = 0;
    codeMetrics.technicalDebt = 0;
    codeMetrics.reliabilityRating = 1;
    codeMetrics.securityRating = 1;
    codeMetrics.bugs = 0;
    codeMetrics.vulnerabilities = 0;
    codeMetrics.codeSmells = 0;

    measures.forEach((measure: any) => {
        const value = parseFloat(measure.value);
        switch (measure.metric) {
            case "ncloc": codeMetrics.linesOfCode = value || 0; break;
            case "files": codeMetrics.filesCount = value || 0; break;
            case "coverage": codeMetrics.coverage = value || 0; break;
            case "duplicated_lines_density": codeMetrics.duplicatedLines = value || 0; break;
            case "violations": codeMetrics.violations = value || 0; break;
            case "complexity": codeMetrics.complexity = value || 0; break;
            case "sqale_index": codeMetrics.technicalDebt = value || 0; break;
            case "reliability_rating": codeMetrics.reliabilityRating = value || 1; break;
            case "security_rating": codeMetrics.securityRating = value || 1; break;
            case "bugs": codeMetrics.bugs = value || 0; break;
            case "vulnerabilities": codeMetrics.vulnerabilities = value || 0; break;
            case "code_smells": codeMetrics.codeSmells = value || 0; break;
        }
    });

    return codeMetrics;
  }

  private detectLanguage(measures: any[]): string {
    const languageMeasure = measures.find(m => m.metric === "ncloc_language_distribution");
    if (languageMeasure) {
        const distribution = this.parseLanguageDistribution(languageMeasure.value);
        return Object.keys(distribution)[0] || "unknown";
    }
    return "unknown";
  }

  private async getLinesOfCodeReport(
    githubUsername: string,
    repoName: string,
    branch: string
  ): Promise<LocReport> {
    try {
      const projectKey = `${githubUsername}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const authHeader = `Basic ${Buffer.from(`${SONARQUBE_API_TOKEN}:`).toString("base64")}`;
      
      const url = new URL(`${SONARQUBE_API_URL}/api/measures/component`);
      url.searchParams.append('component', projectKey);
      url.searchParams.append('branch', branch);
      url.searchParams.append('metricKeys', 'ncloc,ncloc_language_distribution');
      
      const response = await fetch(url.toString(), {
        headers: { Authorization: authHeader }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch lines of code: ${await response.text()}`);
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