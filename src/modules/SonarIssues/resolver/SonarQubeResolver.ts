import { Resolver, Query, Arg, Mutation } from "type-graphql";
import { SonarIssue } from "../entity/sonarIssue.entity";
import { Project } from "../../Project/entity/project.entity";
import { User } from "../../user/entity/user.entity";
import { CodeMetrics } from "../../codeMetrics/entity/codeMetrics.entity";
import dataSource from "../../../database/data-source";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { AnalysisResult } from "../graphql/types/AnalysisResult";
import { GraphQLJSONObject } from 'graphql-type-json';
import { LocReport } from "../graphql/types/LocReport";
import path from 'path';

dotenv.config();

const SONARQUBE_API_URL = process.env.SONARQUBE_API_URL;
const SONARQUBE_API_TOKEN = process.env.SONARQUBE_API_TOKEN;
const GITHUB_API_URL = process.env.GITHUB_API;

@Resolver()
export class SonarQubeResolver {
  private sonarIssueRepo = dataSource.getRepository(SonarIssue);
  private projectRepo = dataSource.getRepository(Project);
  private userRepo = dataSource.getRepository(User);
  private metricsRepo = dataSource.getRepository(CodeMetrics);

  @Query(() => Project, { nullable: true })
  async getProjectAnalysis(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ) {
    const projectKey = `${githubUsername}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    
    const project = await this.projectRepo.findOne({
      where: { repoName: projectKey },
      relations: ["sonarIssues", "codeMetrics", "user"]
    });

    if (!project) {
      throw new Error(`Project "${repoName}" not found for user ${githubUsername}. It may not have been analyzed yet.`);
    }

    return project;
  }

  @Query(() => LocReport)
  async getLinesOfCodeReport(
    @Arg("githubUsername") githubUsername: string,
    @Arg("repoName") repoName: string
  ): Promise<LocReport> {
    try {
      const projectKey = `${githubUsername}_${repoName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      
      const project = await this.projectRepo.findOne({
        where: { repoName: projectKey },
        relations: ["codeMetrics"]
      });
    
      if (!project) {
        throw new Error(`Project "${repoName}" not found for user ${githubUsername}`);
      }

      const totalLines = project.codeMetrics.reduce((sum, metric) => {
        return sum + (metric.linesOfCode || 0);
      }, 0);

      const defaultBranchMetric = project.codeMetrics.find(m => m.branch === project.defaultBranch);
      const sonarQubeLines = defaultBranchMetric?.linesOfCode || 0;

      return {
        totalLines,
        sonarQubeLines,
        languageDistribution: project.languageDistribution || {},
        lastUpdated: project.lastAnalysisDate || new Date(),
        analysisDuration: project.analysisDuration,
        analysisStatus: project.result
      };
    } catch (error) {
      console.error('Error in getLinesOfCodeReport:', error);
      throw new Error('Failed to generate lines of code report');
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
      console.error(`[triggerAutomaticAnalysis] Error:`, error);
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
      console.error(`Analysis failed:`, error);
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
      console.error(`[configureSonarQubeProject] Error configuring ${repo.name}:`, error);
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
          console.log(`Updating existing webhook for project ${project.repoName}`);
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

      console.log(`Creating new webhook for project ${project.repoName}`);
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
          console.warn('Maximum webhooks reached, proceeding without webhook');
          return;
        }
        throw new Error(`Failed to create webhook: ${await createResponse.text()}`);
      }
    } catch (error) {
      console.error(`[configureSonarQubeWebhook] Error:`, error);
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
  
      const repoContentsResponse = await fetch(
        `${GITHUB_API_URL}/repos/${project.username}/${project.title}/contents`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github.v3+json"
          }
        }
      );
  
      if (repoContentsResponse.status === 404 || (repoContentsResponse.ok && (await repoContentsResponse.json()).length === 0)) {
        project.languageDistribution = {};
        project.result = "Analysis completed (empty repository)";
        project.analysisEndTime = new Date();
        await this.projectRepo.save(project);
        return true;
      }
  
      if (!repoContentsResponse.ok) {
        throw new Error(`Failed to check repository contents: ${await repoContentsResponse.text()}`);
      }
  
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { execSync, exec } = require('child_process');
  
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-'));
      const repoPath = path.join(tempDir, "repo");
  
      try {
        console.log(`Cloning repository: ${project.githubUrl}`);
        execSync(`git clone ${project.githubUrl} ${repoPath}`, { stdio: 'inherit' });
  
        const propertiesFile = path.join(repoPath, 'sonar-project.properties');
        const scannerProperties = [
          `sonar.projectKey=${project.repoName}`,
          `sonar.projectName=${project.title}`,
          `sonar.host.url=${SONARQUBE_API_URL}`,
          `sonar.login=${SONARQUBE_API_TOKEN}`,
          `sonar.scm.provider=git`,
          `sonar.sourceEncoding=UTF-8`,
          `sonar.scm.forceReloadAll=true`,
          `sonar.scm.revision=HEAD`,
          `sonar.scm.disabled=false`,
          `sonar.scm.exclusions.disabled=true`
        ].join('\n');
  
        fs.writeFileSync(propertiesFile, scannerProperties);
        console.log('SonarQube properties file created');
        
        const scannerCommand = `sonar-scanner -Dproject.settings=${propertiesFile} -Dsonar.projectBaseDir=${repoPath}`;
        console.log(`Executing SonarScanner: ${scannerCommand}`);
  
        await new Promise<void>((resolve, reject) => {
          exec(scannerCommand, (error: Error | null, stdout: string, stderr: string) => {
            if (error) {
              console.error('SonarScanner execution error:', error, stderr);
              reject(error);
            } else {
              console.log('SonarScanner output:', stdout);
              resolve();
            }
          });
        });
  
        return await this.waitForProjectAnalysis(project, authHeader);
      } catch (cliError) {
        console.error('Failed to execute SonarScanner:', cliError);
        throw new Error('SonarScanner execution failed');
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.error('Error cleaning up temporary files:', cleanupError);
        }
      }
    } catch (error) {
      console.error(`[triggerSonarQubeAnalysis] Error:`, error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      { key: 'sonar.scm.revision', value: 'HEAD' }
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

  private async waitForProjectAnalysis(project: Project, authHeader: string) {
    let attempts = 0;
    const maxAttempts = 30;
    let lastError: Error | null = null;
  
    while (attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 10000));
  
      try {
        const ceActivityResponse = await fetch(
          `${SONARQUBE_API_URL}/api/ce/component?component=${project.repoName}`,
          { headers: { Authorization: authHeader } }
        );
  
        if (ceActivityResponse.ok) {
          const activityData = await ceActivityResponse.json();
          const currentTask = activityData.current && activityData.current.status;
          
          if (currentTask === 'SUCCESS') {
            console.log('Analysis completed successfully, storing results');
            await this.storeAnalysisResults(project, authHeader);
            return true;
          }
          if (currentTask === 'FAILED') {
            throw new Error(`Analysis failed: ${activityData.current.errorMessage || 'Unknown error'}`);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
        } else {
          lastError = new Error(String(error));
        }
      }
    }
  
    if (lastError) {
      throw lastError;
    }
  
    throw new Error('Analysis did not complete within expected time');
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
            Accept: "application/vnd.github.v3+json"
          }
        }
      );
  
      if (!response.ok) throw new Error(await response.text());
  
      const languagesData = await response.json();
      let totalLines = 0;
      const languages: Record<string, number> = {};
      
      const bytesPerLine: Record<string, number> = {
        'JavaScript': 20,
        'TypeScript': 20,
        'Java': 15,
        'Python': 10,
        'Ruby': 10,
        'PHP': 15,
        'C++': 15,
        'C': 15,
        'Go': 15,
        'Swift': 15,
        'Kotlin': 15,
        'HTML': 30,
        'CSS': 25,
        'SCSS': 25,
        'JSON': 40
      };

      for (const [language, bytes] of Object.entries(languagesData)) {
        const avgBytesPerLine = bytesPerLine[language] || 20;
        const lines = Math.floor(Number(bytes) / avgBytesPerLine);
        languages[language] = Math.round(lines);
        totalLines += lines;
      }

      return { totalLines: Math.round(totalLines), languages };
    } catch (error) {
      console.error(`[getRepositoryLinesOfCode] Error:`, error);
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
        await this.storeAnalysisResults(project, authHeader);
      } else if (status === 'FAILED') {
        project.result = 'Analysis failed';
        await queryRunner.manager.save(project);
      }
  
      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error handling webhook event:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async storeAnalysisResults(project: Project, authHeader: string) {
    if (!project.repoName) {
        throw new Error("Project repository name is required");
    }

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // 1. Get the correct branch name - use project.defaultBranch or fall back to 'main'
        let branchName = project.defaultBranch || 'main';
        
        // 2. Find the project in SonarQube
        console.log(`Searching for project ${project.repoName} in SonarQube`);
        const searchUrl = new URL(`${SONARQUBE_API_URL}/api/projects/search`);
        searchUrl.searchParams.append('q', project.repoName);
        
        const searchResponse = await fetch(searchUrl.toString(), {
            headers: { Authorization: authHeader }
        });

        if (!searchResponse.ok) {
            throw new Error(`Failed to search projects: ${await searchResponse.text()}`);
        }

        const searchData = await searchResponse.json();
        const sonarProject = searchData.components.find(
            (c: any) => c.key === project.repoName || c.name === project.repoName
        );

        if (!sonarProject) {
            throw new Error(`Project ${project.repoName} not found in SonarQube`);
        }

        const sonarProjectKey = sonarProject.key;
        console.log(`Found SonarQube project: ${sonarProjectKey}`);

        // 3. Verify the branch exists - with automatic fallback to 'main' if 'master' not found
        console.log(`Checking if branch ${branchName} exists for project ${sonarProjectKey}`);
        const branchUrl = new URL(`${SONARQUBE_API_URL}/api/project_branches/list`);
        branchUrl.searchParams.append('project', sonarProjectKey);
        
        const branchResponse = await fetch(branchUrl.toString(), {
            headers: { Authorization: authHeader }
        });

        if (branchResponse.ok) {
            const branchData = await branchResponse.json();
            const availableBranches = branchData.branches.map((b: any) => b.name);
            
            // If requested branch doesn't exist, try 'main' if we were looking for 'master'
            if (!availableBranches.includes(branchName)) {
                if (branchName === 'master' && availableBranches.includes('main')) {
                    console.log(`Branch master not found, falling back to main`);
                    branchName = 'main';
                } else {
                    throw new Error(`Branch ${branchName} not found. Available branches: ${availableBranches.join(', ')}`);
                }
            }
        }

        // 4. Delete existing data
        console.log(`Deleting existing data for project ${sonarProjectKey}`);
        await queryRunner.manager.delete(SonarIssue, { project: { u_id: project.u_id } });
        await queryRunner.manager.delete(CodeMetrics, { 
            project: { u_id: project.u_id },
            branch: branchName 
        });

        // 5. Fetch metrics
        console.log('Fetching metrics from SonarQube');
        const metricsUrl = new URL(`${SONARQUBE_API_URL}/api/measures/component`);
        metricsUrl.searchParams.append('component', sonarProjectKey);
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

        // 6. Fetch quality gate status
        console.log('Fetching quality gate status');
        const qualityGateUrl = new URL(`${SONARQUBE_API_URL}/api/qualitygates/project_status`);
        qualityGateUrl.searchParams.append('projectKey', sonarProjectKey);
        qualityGateUrl.searchParams.append('branch', branchName);

        let qualityGateStatus = 'UNKNOWN';
        const qualityGateResponse = await fetch(qualityGateUrl.toString(), {
            headers: { Authorization: authHeader }
        });

        if (qualityGateResponse.ok) {
            const qualityGateData = await qualityGateResponse.json();
            qualityGateStatus = qualityGateData.projectStatus.status;
        }

        // 7. Fetch issues
        console.log('Fetching issues from SonarQube');
        const allIssues: SonarIssue[] = [];
        let page = 1;
        let hasMoreIssues = true;

        while (hasMoreIssues) {
            const issuesUrl = new URL(`${SONARQUBE_API_URL}/api/issues/search`);
            issuesUrl.searchParams.append('componentKeys', sonarProjectKey);
            issuesUrl.searchParams.append('branch', branchName);
            issuesUrl.searchParams.append('ps', '500');
            issuesUrl.searchParams.append('p', page.toString());

            const issuesResponse = await fetch(issuesUrl.toString(), {
                headers: { Authorization: authHeader }
            });

            if (!issuesResponse.ok) {
                throw new Error(`Failed to fetch issues: ${await issuesResponse.text()}`);
            }

            const issuesData = await issuesResponse.json();
            const issues = issuesData.issues || [];

            if (issues.length === 0) {
                hasMoreIssues = false;
            } else {
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
                    return newIssue;
                }));
                page++;
            }
        }

        // 8. Save data
        if (allIssues.length > 0) {
            await queryRunner.manager.save(SonarIssue, allIssues);
        }

        const codeMetrics = new CodeMetrics();
        codeMetrics.project = project;
        codeMetrics.branch = branchName;
        codeMetrics.qualityGateStatus = qualityGateStatus;
        codeMetrics.language = this.detectLanguage(measures);

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
                case "reliability_rating": codeMetrics.reliabilityRating = value || 0; break;
                case "security_rating": codeMetrics.securityRating = value || 0; break;
                case "bugs": codeMetrics.bugs = value || 0; break;
                case "vulnerabilities": codeMetrics.vulnerabilities = value || 0; break;
                case "code_smells": codeMetrics.codeSmells = value || 0; break;
            }
        });

        await queryRunner.manager.save(CodeMetrics, codeMetrics);
        project.lastAnalysisDate = new Date();
        await queryRunner.manager.save(Project, project);
        await queryRunner.commitTransaction();

        console.log(`Successfully stored analysis results for project ${sonarProjectKey}`);

    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error storing analysis results:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
  }

  private detectLanguage(measures: any[]): string {
    const languageMeasure = measures.find(m => m.metric === "ncloc_language_distribution");
    if (languageMeasure) {
        const distribution = this.parseLanguageDistribution(languageMeasure.value);
        return Object.keys(distribution)[0] || "unknown";
    }
    return "unknown";
  }

  private parseLanguageDistribution(distribution: string): Record<string, number> {
    const result: Record<string, number> = {};
    if (!distribution) return result;
    
    const items = distribution.split(/[;,]/).filter(item => item.includes('='));
    
    items.forEach(item => {
        const [lang, lines] = item.split('=');
        if (lang && lines && !isNaN(Number(lines))) {
            result[lang.trim()] = parseInt(lines);
        }
    });
    
    return Object.fromEntries(
        Object.entries(result).sort(([,a], [,b]) => b - a)
    );
  }
}